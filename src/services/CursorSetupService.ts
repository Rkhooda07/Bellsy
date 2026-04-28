import * as crypto from 'crypto';
import * as http from 'http';
import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';

import { CURSOR_WEBHOOK_PATH, DEFAULT_CURSOR_WEBHOOK_SECRET, DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from '../core/constants';
import { OutputChannelLogger } from './OutputChannelLogger';

export class CursorSetupService {
  constructor(private readonly logger: OutputChannelLogger) {}

  async run(): Promise<void> {
    const config = vscode.workspace.getConfiguration('agentNotifier');
    const port = config.get<number>('httpPort', DEFAULT_HTTP_PORT);
    const localWebhookUrl = `http://127.0.0.1:${port}${CURSOR_WEBHOOK_PATH}`;

    let secret = config.get<string>('cursorWebhookSecret', DEFAULT_CURSOR_WEBHOOK_SECRET).trim();
    if (!secret) {
      secret = uuid();
      await config.update('cursorWebhookSecret', secret, vscode.ConfigurationTarget.Global);
      this.logger.info('Generated Cursor webhook secret for setup flow.');
    }

    const message =
      'Cursor background-agent setup is ready. Copy the secret, expose the local webhook URL through any HTTPS tunnel, then paste the public URL and the secret into Cursor.';

    const action = await vscode.window.showInformationMessage(
      message,
      'Copy Secret',
      'Copy Local URL',
      'Copy Setup Checklist',
      'Open Settings',
    );

    if (action === 'Copy Secret') {
      await vscode.env.clipboard.writeText(secret);
      await vscode.window.showInformationMessage('Cursor webhook secret copied.');
      return;
    }

    if (action === 'Copy Local URL') {
      await vscode.env.clipboard.writeText(localWebhookUrl);
      await vscode.window.showInformationMessage('Local Cursor webhook URL copied.');
      return;
    }

    if (action === 'Copy Setup Checklist') {
      const checklist = [
        '1. Expose this local webhook URL through an HTTPS tunnel:',
        localWebhookUrl,
        '',
        '2. In Cursor background-agent webhook settings, paste the public HTTPS URL ending in /cursor/webhook.',
        `3. Use this same webhook secret in Cursor: ${secret}`,
        '4. FINISHED triggers completion notifications.',
        '5. ERROR triggers a strong attention notification.',
      ].join('\n');

      await vscode.env.clipboard.writeText(checklist);
      await vscode.window.showInformationMessage('Cursor setup checklist copied.');
      return;
    }

    if (action === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'agentNotifier.cursorWebhookSecret');
    }
  }

  async testWebhook(): Promise<void> {
    const config = vscode.workspace.getConfiguration('agentNotifier');
    const port = config.get<number>('httpPort', DEFAULT_HTTP_PORT);
    const secret = config.get<string>('cursorWebhookSecret', DEFAULT_CURSOR_WEBHOOK_SECRET).trim();
    const scenario = await vscode.window.showQuickPick(
      [
        {
          label: 'Finished',
          description: 'Test the normal completion popup, notification, and sound',
          status: 'FINISHED',
          summary: 'Cursor background agent finished successfully.',
        },
        {
          label: 'Error',
          description: 'Test the stronger attention popup, notification, and sound',
          status: 'ERROR',
          summary: 'Cursor background agent needs attention.',
        },
      ],
      {
        placeHolder: 'Choose a Cursor webhook scenario to simulate locally',
        canPickMany: false,
      },
    );

    if (!scenario) {
      return;
    }

    const body = JSON.stringify({
      event: 'statusChange',
      timestamp: new Date().toISOString(),
      id: `local_${Date.now()}`,
      status: scenario.status,
      summary: scenario.summary,
      target: {
        url: 'https://cursor.com/agents?id=local_test',
      },
    });

    const signature = secret
      ? `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
      : undefined;

    const response = await postJson({
      hostname: DEFAULT_HTTP_HOST,
      port,
      path: CURSOR_WEBHOOK_PATH,
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': 'statusChange',
        ...(signature ? { 'X-Webhook-Signature': signature } : {}),
      },
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      this.logger.info(`Local Cursor webhook test accepted (${scenario.status}).`);
      await vscode.window.showInformationMessage(`Cursor webhook ${scenario.label.toLowerCase()} test sent.`);
      return;
    }

    this.logger.error(`Local Cursor webhook test failed (${response.statusCode}): ${response.body}`);
    await vscode.window.showErrorMessage(
      `Cursor webhook test failed with ${response.statusCode}: ${response.body || 'unknown error'}`,
    );
  }
}

type PostJsonOptions = {
  hostname: string;
  port: number;
  path: string;
  body: string;
  headers: Record<string, string>;
};

function postJson(options: PostJsonOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: 'POST',
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        headers: {
          'Content-Length': Buffer.byteLength(options.body).toString(),
          ...options.headers,
        },
      },
      (response) => {
        let responseBody = '';

        response.on('data', (chunk) => {
          responseBody += chunk.toString();
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: responseBody,
          });
        });
      },
    );

    request.on('error', reject);
    request.write(options.body);
    request.end();
  });
}
