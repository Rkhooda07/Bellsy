import * as vscode from 'vscode';

export class NotificationService {
  async showPermissionRequest(message: string): Promise<'Allow' | 'Deny'> {
    const result = await vscode.window.showWarningMessage(
      `Pingly: Permission Needed\n${message}`,
      {
        modal: false,
      },
      'Allow',
      'Deny',
    );

    return result === 'Allow' ? 'Allow' : 'Deny';
  }

  showTaskCompleted(message: string): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(
      `Pingly: Task Completed\n${message}`,
      {
        modal: false,
      },
      'Dismiss',
      'Open Logs',
    );
  }

  showAttentionRequired(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(
      `Pingly: Attention Required\n${message}`,
      {
        modal: false,
      },
      'Dismiss',
      'Open Logs',
    );
  }

  showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(`Pingly Error: ${message}`);
  }

  async showPendingReminder(count: number): Promise<void> {
    const suffix = count === 1 ? 'request is' : 'requests are';
    const action = await vscode.window.showWarningMessage(
      `${count} local agent permission ${suffix} still waiting for your response.`,
      'Review Pending Requests',
    );

    if (action === 'Review Pending Requests') {
      await vscode.commands.executeCommand('agentNotifier.showPendingList');
    }
  }
}
