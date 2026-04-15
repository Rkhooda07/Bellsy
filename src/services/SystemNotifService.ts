import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import notifier from 'node-notifier';

type PermissionChoice = 'Allow' | 'Deny';

export class SystemNotifService {
  private readonly macNotifierPath = path.join(
    this.extensionPath,
    'node_modules',
    'node-notifier',
    'vendor',
    'mac.noindex',
    'terminal-notifier.app',
    'Contents',
    'MacOS',
    'terminal-notifier',
  );

  constructor(private readonly extensionPath: string) {}

  usesNativeSound(): boolean {
    return false;
  }

  async showPermissionRequest(message: string): Promise<PermissionChoice | undefined> {
    if (os.platform() === 'darwin') {
      await this.showMacNotification('AI Agent - Permission Required', message, 'Bottle');
      return undefined;
    }

    this.notifyGeneric('AI Agent - Permission Required', message, 30, true);
    return undefined;
  }

  notifyCompletion(message: string): void {
    if (os.platform() === 'darwin') {
      void this.showMacNotification('AI Agent - Task Completed', message, 'Ping');
      return;
    }

    this.notifyGeneric('AI Agent - Task Completed', message, 10, false);
  }

  private notifyGeneric(title: string, message: string, timeout: number, critical: boolean): void {
    notifier.notify({
      title,
      message,
      icon: path.join(this.extensionPath, 'assets', 'icon.png'),
      timeout,
      urgency: critical ? 'critical' : 'normal',
      wait: false,
    });
  }

  private showMacNotification(title: string, message: string, sound: string): Promise<void> {
    const args = [
      '-title',
      title,
      '-message',
      message,
      '-sender',
      'com.microsoft.VSCode',
      '-activate',
      'com.microsoft.VSCode',
      '-sound',
      sound,
    ];

    return new Promise((resolve) => {
      execFile(this.macNotifierPath, args, () => resolve());
    });
  }
}
