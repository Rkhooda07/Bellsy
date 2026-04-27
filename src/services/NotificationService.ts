import * as vscode from 'vscode';

export class NotificationService {
  async showPermissionRequest(message: string): Promise<'Allow' | 'Deny'> {
    const result = await vscode.window.showWarningMessage(
      `AI Agent Needs Permission\n${message}`,
      {
        modal: false,
      },
      'Allow',
      'Deny',
    );

    return result === 'Allow' ? 'Allow' : 'Deny';
  }

  showTaskCompleted(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(
      `AI Agent Completed\n${message}`,
      {
        modal: false,
      },
      'Dismiss',
      'Open Logs',
    );
  }

  showAttentionRequired(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(
      `AI Agent Needs Attention\n${message}`,
      {
        modal: false,
      },
      'Dismiss',
      'Open Logs',
    );
  }

  showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(`AI Agent Notifier Error: ${message}`);
  }

  async showPendingReminder(count: number): Promise<void> {
    const suffix = count === 1 ? 'request is' : 'requests are';
    const action = await vscode.window.showWarningMessage(
      `${count} AI agent permission ${suffix} still waiting for your response.`,
      'Review Pending Requests',
    );

    if (action === 'Review Pending Requests') {
      await vscode.commands.executeCommand('agentNotifier.showPendingList');
    }
  }
}
