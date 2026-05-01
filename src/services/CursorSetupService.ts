import * as vscode from 'vscode';

import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';
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
    private readonly getLocalEndpoint: () => string | undefined,
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
    const endpoint = this.getLocalEndpoint() ?? 'http://127.0.0.1:9001/event';
    const endpointFlag = endpoint === 'http://127.0.0.1:9001/event' ? '' : ` --endpoint ${endpoint}`;
    const action = await vscode.window.showQuickPick(
      [
        { label: 'Copy Claude Code Wrapper', detail: `Start Claude Code through pingly-run (${endpoint}).` },
        { label: 'Copy Codex Wrapper', detail: `Start Codex CLI through pingly-run (${endpoint}).` },
        { label: 'Copy Generic Wrapper', detail: `Wrap any local command with pingly-run (${endpoint}).` },
        { label: 'Copy Direct Event Curl', detail: 'Send a completion or error event from any script.' },
        { label: 'Copy Setup Checklist', detail: 'Quick-start steps for local notifications.' },
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
      await vscode.env.clipboard.writeText(`pingly-run --agent claude-code${endpointFlag} -- claude`);
      await vscode.window.showInformationMessage('Claude Code wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Codex Wrapper') {
      await vscode.env.clipboard.writeText(`pingly-run --agent codex${endpointFlag} -- codex`);
      await vscode.window.showInformationMessage('Codex wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Generic Wrapper') {
      await vscode.env.clipboard.writeText(`pingly-run --agent my-tool${endpointFlag} -- your-command-here`);
      await vscode.window.showInformationMessage('Generic wrapper command copied.');
      return;
    }

    if (action.label === 'Copy Direct Event Curl') {
      await vscode.env.clipboard.writeText(
        [
          `curl -X POST ${endpoint} \\`,
          '  -H "content-type: application/json" \\',
          `  -d '{"type":"task_completed","message":"Local agent finished"}'`,
        ].join('\n'),
      );
      await vscode.window.showInformationMessage('Direct event curl command copied.');
      return;
    }

    if (action.label === 'Copy Setup Checklist') {
      const checklist = [
        '1. Install the extension and keep it open in Cursor, VS Code, or another VS Code-compatible editor.',
        `2. Start your local tool through a wrapper like: pingly-run --agent claude-code${endpointFlag} -- claude`,
        '3. Use Pingly: Test Local Notifications to verify completion, error, and approval flows.',
        `4. Advanced scripts can post JSON directly to ${endpoint}.`,
        '5. Keep the terminal and the editor on the same machine or local network namespace.',
      ].join('\n');

      await vscode.env.clipboard.writeText(checklist);
      await vscode.window.showInformationMessage('Local setup checklist copied.');
      return;
    }
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
}
