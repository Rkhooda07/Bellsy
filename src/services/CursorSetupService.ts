import * as vscode from 'vscode';

import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';
import { HostedRelayService } from '../relay/HostedRelayService';
import { OutputChannelLogger } from './OutputChannelLogger';

type LocalScenario = {
  label: string;
  description: string;
  eventType: AgentEventType;
  message: string;
  priority: AgentEventPriority;
};

export class CursorSetupService {
  constructor(
    private readonly logger: OutputChannelLogger,
    private readonly relayService: HostedRelayService,
    private readonly emitLocalEvent: (event: {
      type: AgentEventType;
      message: string;
      priority: AgentEventPriority;
      source: AgentEventSource;
      agent?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    }) => void,
  ) {}

  async run(): Promise<void> {
    const endpoint = 'http://127.0.0.1:9001/event';
    const action = await vscode.window.showQuickPick(
      [
        { label: 'Copy Claude Code Wrapper', detail: 'Start Claude Code through pingly-run.' },
        { label: 'Copy Codex Wrapper', detail: 'Start Codex CLI through pingly-run.' },
        { label: 'Copy Generic Wrapper', detail: 'Wrap any local command with pingly-run.' },
        { label: 'Copy Direct Event Curl', detail: 'Send a completion or error event from any script.' },
        { label: 'Copy Setup Checklist', detail: 'Quick-start steps for local notifications.' },
        { label: 'Show Experimental Cursor Relay Setup', detail: 'Copy hosted webhook values if you still want the secondary relay path.' },
      ],
      {
        title: 'Pingly: Setup Local Agent Notifications',
        placeHolder: 'Choose the local workflow you want to copy',
        canPickMany: false,
      },
    );

    if (!action) {
      return;
    }

    if (action.label === 'Copy Claude Code Wrapper') {
      await vscode.env.clipboard.writeText('pingly-run --agent claude-code -- claude');
      await vscode.window.showInformationMessage('Claude Code wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Codex Wrapper') {
      await vscode.env.clipboard.writeText('pingly-run --agent codex -- codex');
      await vscode.window.showInformationMessage('Codex wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Generic Wrapper') {
      await vscode.env.clipboard.writeText('pingly-run --agent my-tool -- your-command-here');
      await vscode.window.showInformationMessage('Generic wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Direct Event Curl') {
      await vscode.env.clipboard.writeText(
        [
          `curl -X POST ${endpoint} \\`,
          '  -H "content-type: application/json" \\',
          `  -d '{"type":"task_completed","message":"Local tool finished"}'`,
        ].join('\n'),
      );
      await vscode.window.showInformationMessage('Direct event curl command copied.');
      return;
    }

    if (action.label === 'Copy Setup Checklist') {
      const checklist = [
        '1. Install the extension and run Pingly: Run Self Test.',
        '2. Start your local tool through a wrapper like: pingly-run --agent claude-code -- claude',
        '3. Keep the extension open in Cursor while the tool runs.',
        '4. Use Pingly: Test Local Notifications to verify completion, error, and approval flows.',
        `5. Advanced scripts can post JSON directly to ${endpoint}.`,
        '6. Native Claude Code or Codex hooks are optional; the wrapper path is the lowest-fuss default.',
      ].join('\n');

      await vscode.env.clipboard.writeText(checklist);
      await vscode.window.showInformationMessage('Local setup checklist copied.');
      return;
    }

    await this.runHostedRelaySetup();
  }

  async testWebhook(): Promise<void> {
    const scenario = await vscode.window.showQuickPick(
      [
        {
          label: 'Completed',
          description: 'Test the normal completion popup, system notification, and sound',
          eventType: AgentEventType.TASK_COMPLETED,
          message: 'Local agent finished successfully.',
          priority: AgentEventPriority.LOW,
        },
        {
          label: 'Needs Attention',
          description: 'Test the stronger error/attention notification path',
          eventType: AgentEventType.ATTENTION_REQUIRED,
          message: 'Local agent needs attention.',
          priority: AgentEventPriority.HIGH,
        },
        {
          label: 'Approval Needed',
          description: 'Test the interactive allow/deny permission flow',
          eventType: AgentEventType.PERMISSION_REQUIRED,
          message: 'Local agent wants approval before continuing.',
          priority: AgentEventPriority.HIGH,
        },
      ] satisfies LocalScenario[],
      {
        title: 'Pingly: Test Local Notifications',
        placeHolder: 'Choose a local event scenario to simulate',
        canPickMany: false,
      },
    );

    if (!scenario) {
      return;
    }

    this.emitLocalEvent({
      type: scenario.eventType,
      source: AgentEventSource.CLI,
      priority: scenario.priority,
      agent: 'local-test',
      message: scenario.message,
      correlationId: `local-test:${scenario.eventType}`,
      metadata: {
        test: true,
        setup: 'local-first',
      },
    });

    this.logger.info(`Local notification test emitted (${scenario.eventType}).`);
    await vscode.window.showInformationMessage(`Local ${scenario.label.toLowerCase()} notification test sent.`);
  }

  private async runHostedRelaySetup(): Promise<void> {
    await this.relayService.start();
    const credentials = this.relayService.getCredentials();

    if (!credentials) {
      const action = await vscode.window.showErrorMessage(
        'Hosted relay is not registered yet. Configure the experimental relay URL and check logs if you still want Cursor cloud-agent setup.',
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
        { label: 'Copy Hosted Webhook URL', detail: credentials.publicWebhookUrl },
        { label: 'Copy Hosted Webhook Secret', detail: credentials.cursorWebhookSecret },
        { label: 'Rotate Hosted Secret', detail: 'Generate a new webhook secret for the hosted relay.' },
      ],
      {
        title: 'Pingly: Hosted Cursor Relay (Experimental)',
        placeHolder: `Connection status: ${status}`,
        canPickMany: false,
      },
    );

    if (!action) {
      return;
    }

    if (action.label === 'Copy Hosted Webhook URL') {
      await vscode.env.clipboard.writeText(credentials.publicWebhookUrl);
      await vscode.window.showInformationMessage('Hosted webhook URL copied.');
      return;
    }

    if (action.label === 'Copy Hosted Webhook Secret') {
      await vscode.env.clipboard.writeText(credentials.cursorWebhookSecret);
      await vscode.window.showInformationMessage('Hosted webhook secret copied.');
      return;
    }

    const updated = await this.relayService.rotateSecret();
    await vscode.env.clipboard.writeText(updated.cursorWebhookSecret);
    await vscode.window.showInformationMessage('Hosted webhook secret rotated and copied.');
  }
}
