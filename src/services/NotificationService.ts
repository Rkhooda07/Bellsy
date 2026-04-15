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
    return vscode.window.showInformationMessage(`AI Agent Completed: ${message}`);
  }

  showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(`AI Agent Notifier Error: ${message}`);
  }
}
