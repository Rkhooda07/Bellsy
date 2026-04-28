import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';

import { CURSOR_WEBHOOK_PATH, DEFAULT_CURSOR_WEBHOOK_SECRET, DEFAULT_HTTP_PORT } from '../core/constants';
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
}
