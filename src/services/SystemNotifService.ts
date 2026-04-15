import * as path from 'path';

import notifier from 'node-notifier';

export class SystemNotifService {
  constructor(private readonly extensionPath: string) {}

  notifyPermission(message: string): void {
    this.notify('AI Agent - Permission Required', message, 30, true);
  }

  notifyCompletion(message: string): void {
    this.notify('AI Agent - Task Completed', message, 10, false);
  }

  private notify(title: string, message: string, timeout: number, critical: boolean): void {
    notifier.notify({
      title,
      message,
      icon: path.join(this.extensionPath, 'assets', 'icon.png'),
      timeout,
      urgency: critical ? 'critical' : 'normal',
      wait: false,
    });
  }
}
