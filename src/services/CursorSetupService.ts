import * as crypto from 'crypto';
import * as http from 'http';
import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';

import { CURSOR_WEBHOOK_PATH, DEFAULT_CURSOR_WEBHOOK_SECRET, DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from '../core/constants';
import { HostedRelayService } from '../relay/HostedRelayService';
import { OutputChannelLogger } from './OutputChannelLogger';

export class CursorSetupService {
  constructor(
    private readonly logger: OutputChannelLogger,
    private readonly relayService: HostedRelayService,
  ) {}

  async run(): Promise<void> {
    if (this.relayService.isConfigured()) {
      await this.runHostedRelaySetup();
      return;
    }

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
      'Copy Tunnel Guide',
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

    if (action === 'Copy Tunnel Guide') {
      const tunnelGuide = [
        'Cursor background-agent webhooks come from the cloud, so Cursor cannot call 127.0.0.1 directly.',
        '',
        'What you need:',
        `- a public HTTPS URL that forwards to ${localWebhookUrl}`,
        '- the same webhook secret in both Cursor and this extension',
        '',
        'After your tunnel is running:',
        `1. Copy the public HTTPS URL from your tunnel tool, for example https://your-url.example.com${CURSOR_WEBHOOK_PATH}`,
        '2. Paste that full public URL into Cursor background-agent webhook settings.',
        `3. Paste this same secret into Cursor: ${secret}`,
        '4. Run Cursor Agent Notifier: Test Cursor Webhook to confirm the local route works before using a real background agent.',
      ].join('\n');

      await vscode.env.clipboard.writeText(tunnelGuide);
      await vscode.window.showInformationMessage('Cursor tunnel guidance copied.');
      return;
    }

    if (action === 'Copy Setup Checklist') {
      const checklist = [
        '1. Expose this local webhook URL through an HTTPS tunnel:',
        localWebhookUrl,
        '',
        '2. Start or open your tunnel tool and create a public HTTPS URL that forwards to the local URL above.',
        `3. In Cursor background-agent webhook settings, paste the full public HTTPS URL ending in ${CURSOR_WEBHOOK_PATH}.`,
        `4. Use this same webhook secret in Cursor: ${secret}`,
        '5. FINISHED triggers completion notifications.',
        '6. ERROR triggers a strong attention notification.',
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
    if (this.relayService.isConfigured()) {
      await this.testHostedRelayWebhook();
      return;
    }

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

  private async runHostedRelaySetup(): Promise<void> {
    await this.relayService.start();
    const credentials = this.relayService.getCredentials();

    if (!credentials) {
      const action = await vscode.window.showErrorMessage(
        'Hosted relay is configured, but this install is not registered yet. Check logs or retry after the relay becomes reachable.',
        'Show Logs',
      );

      if (action === 'Show Logs') {
        this.logger.show();
      }

      return;
    }

    const status = this.relayService.getStatus();
    const action = await vscode.window.showQuickPick(
      [
        { label: 'Copy Webhook URL', detail: credentials.publicWebhookUrl },
        { label: 'Copy Webhook Secret', detail: credentials.cursorWebhookSecret },
        { label: 'Copy Cursor Setup Checklist', detail: 'Copies the full one-time Cursor setup steps.' },
        { label: 'Rotate Secret', detail: 'Generates a new Cursor webhook secret and updates this install.' },
        { label: 'Test Cursor Webhook', detail: 'Sends a hosted FINISHED or ERROR test through the relay.' },
      ],
      {
        title: 'Cursor Agent Notifier: Setup Cursor Webhook',
        placeHolder: `Connection status: ${status}`,
        canPickMany: false,
      },
    );

    if (!action) {
      return;
    }

    if (action.label === 'Copy Webhook URL') {
      await vscode.env.clipboard.writeText(credentials.publicWebhookUrl);
      await vscode.window.showInformationMessage('Hosted Cursor webhook URL copied.');
      return;
    }

    if (action.label === 'Copy Webhook Secret') {
      await vscode.env.clipboard.writeText(credentials.cursorWebhookSecret);
      await vscode.window.showInformationMessage('Hosted Cursor webhook secret copied.');
      return;
    }

    if (action.label === 'Copy Cursor Setup Checklist') {
      const checklist = [
        '1. Open Cursor background-agent webhook settings.',
        `2. Paste this webhook URL: ${credentials.publicWebhookUrl}`,
        `3. Paste this webhook secret: ${credentials.cursorWebhookSecret}`,
        '4. Save the Cursor webhook settings once.',
        '5. FINISHED triggers completion notifications.',
        '6. ERROR triggers a strong attention notification.',
        `7. Current relay connection status: ${status}`,
      ].join('\n');

      await vscode.env.clipboard.writeText(checklist);
      await vscode.window.showInformationMessage('Cursor setup checklist copied.');
      return;
    }

    if (action.label === 'Rotate Secret') {
      const updated = await this.relayService.rotateSecret();
      await vscode.env.clipboard.writeText(updated.cursorWebhookSecret);
      await vscode.window.showInformationMessage('Cursor webhook secret rotated and copied.');
      return;
    }

    if (action.label === 'Test Cursor Webhook') {
      await this.testHostedRelayWebhook();
    }
  }

  private async testHostedRelayWebhook(): Promise<void> {
    await this.relayService.start();
    const scenario = await vscode.window.showQuickPick(
      [
        {
          label: 'Finished',
          description: 'Test the normal completion popup, notification, and sound',
          status: 'FINISHED' as const,
        },
        {
          label: 'Error',
          description: 'Test the stronger attention popup, notification, and sound',
          status: 'ERROR' as const,
        },
      ],
      {
        placeHolder: 'Choose a Cursor webhook scenario to send through the hosted relay',
        canPickMany: false,
      },
    );

    if (!scenario) {
      return;
    }

    try {
      await this.relayService.sendTestWebhook(scenario.status);
      await vscode.window.showInformationMessage(`Cursor webhook ${scenario.label.toLowerCase()} test sent.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Hosted relay webhook test failed: ${message}`);
      await vscode.window.showErrorMessage(`Hosted relay webhook test failed: ${message}`);
    }
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
