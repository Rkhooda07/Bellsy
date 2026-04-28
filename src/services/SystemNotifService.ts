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

  async showPermissionRequest(message: string, critical = true): Promise<PermissionChoice | undefined> {
    if (os.platform() === 'darwin') {
      await this.showMacNotification('Pingly - Permission Required', message, critical);
      return undefined;
    }

    this.notifyGeneric('Pingly - Permission Required', message, 30, critical);
    return undefined;
  }

  notifyCompletion(message: string, critical = false): void {
    if (os.platform() === 'darwin') {
      void this.showMacNotification('Pingly - Task Completed', message, critical);
      return;
    }

    this.notifyGeneric('Pingly - Task Completed', message, 10, critical);
  }

  notifyAttention(message: string, critical = true): void {
    if (os.platform() === 'darwin') {
      void this.showMacNotification('Pingly - Attention Required', message, critical);
      return;
    }

    this.notifyGeneric('Pingly - Attention Required', message, 30, critical);
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

  private showMacNotification(title: string, message: string, critical: boolean): Promise<void> {
    const args = [
      '-title',
      title,
      '-message',
      message,
      '-sender',
      this.detectMacSenderBundleId(),
    ];

    if (critical) {
      args.push('-timeout', '30');
    }

    return new Promise((resolve) => {
      execFile(this.macNotifierPath, args, { timeout: 3000 }, () => resolve());
    });
  }

  private detectMacSenderBundleId(): string {
    const vscodeAppName = process.env.VSCODE_CLI_APPNAME ?? '';

    if (vscodeAppName.includes('Code - Insiders')) {
      return 'com.microsoft.VSCodeInsiders';
    }

    if (vscodeAppName.includes('VSCodium')) {
      return 'com.vscodium';
    }

    if (vscodeAppName.includes('Cursor')) {
      return 'com.todesktop.230313mzl4w4u92';
    }

    return 'com.microsoft.VSCode';
  }
}
