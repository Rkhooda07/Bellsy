import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import notifier from 'node-notifier';

type PermissionChoice = 'Allow' | 'Deny';
const MAC_NOTIFIER_WARMUP_GROUP = 'bellsy-warmup';

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
  private readonly macNotificationCenter: typeof notifier;
  private hasWarmedMacNotifier = false;

  constructor(
    private readonly extensionPath: string,
    private readonly hostAppName = '',
    private readonly clickOpenUrl?: string,
    private readonly onNotificationClick: () => void = () => undefined,
  ) {
    this.macNotificationCenter = new notifier.NotificationCenter({
      withFallback: false,
      customPath: this.macNotifierPath,
    }) as typeof notifier;
    this.warmMacNotifier();
  }

  usesNativeSound(): boolean {
    return false;
  }

  async showPermissionRequest(message: string, critical = true): Promise<PermissionChoice | undefined> {
    if (os.platform() === 'darwin') {
      await this.showMacNotification('Bellsy - Permission Required', message, critical);
      return undefined;
    }

    this.notifyGeneric('Bellsy - Permission Required', message, 30, critical);
    return undefined;
  }

  notifyCompletion(message: string, critical = false): void {
    if (os.platform() === 'darwin') {
      void this.showMacNotification('Bellsy - Task Completed', message, critical);
      return;
    }

    this.notifyGeneric('Bellsy - Task Completed', message, 10, critical);
  }

  notifyAttention(message: string, critical = true): void {
    if (os.platform() === 'darwin') {
      void this.showMacNotification('Bellsy - Attention Required', message, critical);
      return;
    }

    this.notifyGeneric('Bellsy - Attention Required', message, 30, critical);
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
    this.warmMacNotifier();
    const senderBundleId = this.detectMacSenderBundleId();
    const notificationOptions = {
      title,
      message,
      wait: true,
      timeout: critical ? 30 : 10,
    } as notifier.Notification & {
      sender?: string;
      activate?: string;
      execute?: string;
      open?: string;
      timeout?: number;
    };

    if (senderBundleId) {
      notificationOptions.sender = senderBundleId;
      notificationOptions.activate = senderBundleId;
    }

    if (this.clickOpenUrl) {
      notificationOptions.open = this.clickOpenUrl;
    } else {
      const activateCommand = this.buildMacActivateCommand();
      if (activateCommand) {
        notificationOptions.execute = activateCommand;
      }
    }

    return new Promise((resolve) => {
      this.macNotificationCenter.notify(
        notificationOptions,
        (_error, response, metadata) => {
          if (this.isActivationResponse(response, metadata?.activationType)) {
            this.onNotificationClick();
          }

          resolve();
        },
      );
    });
  }

  private warmMacNotifier(): void {
    if (os.platform() !== 'darwin' || this.hasWarmedMacNotifier) {
      return;
    }

    this.hasWarmedMacNotifier = true;
    execFile(this.macNotifierPath, ['-remove', MAC_NOTIFIER_WARMUP_GROUP], () => undefined);
  }

  private detectMacSenderBundleId(): string | undefined {
    const signals = [
      this.hostAppName,
      process.env.VSCODE_CLI_APPNAME ?? '',
      process.env.VSCODE_DESKTOP_APP_NAME ?? '',
      process.execPath,
    ].join(' ');

    if (signals.includes('Cursor')) {
      return undefined;
    }

    if (signals.includes('Code - Insiders')) {
      return 'com.microsoft.VSCodeInsiders';
    }

    if (signals.includes('VSCodium')) {
      return 'com.vscodium';
    }

    if (signals.includes('Visual Studio Code') || signals.includes('VS Code') || signals.includes('Code')) {
      return 'com.microsoft.VSCode';
    }

    const termInfo = this.detectTerminalInfo();
    if (termInfo?.bundleId) {
      return termInfo.bundleId;
    }

    return undefined;
  }

  private buildMacActivateCommand(): string | undefined {
    const appName = this.detectMacAppName();
    if (!appName) {
      return undefined;
    }

    const escapedAppName = appName.replace(/'/g, "'\\''");
    return `open -a '${escapedAppName}'`;
  }

  private detectMacAppName(): string | undefined {
    const signals = [
      this.hostAppName,
      process.env.VSCODE_CLI_APPNAME ?? '',
      process.env.VSCODE_DESKTOP_APP_NAME ?? '',
      process.execPath,
    ].join(' ');

    if (signals.includes('Cursor')) {
      return 'Cursor';
    }

    if (signals.includes('Code - Insiders')) {
      return 'Visual Studio Code - Insiders';
    }

    if (signals.includes('VSCodium')) {
      return 'VSCodium';
    }

    if (signals.includes('Visual Studio Code') || signals.includes('VS Code') || signals.includes('Code')) {
      return 'Visual Studio Code';
    }

    const termInfo = this.detectTerminalInfo();
    if (termInfo?.appName) {
      return termInfo.appName;
    }

    const termProgram = process.env.TERM_PROGRAM;
    if (termProgram && termProgram !== 'vscode') {
      return termProgram.replace(/\.app$/, '');
    }

    return this.hostAppName || undefined;
  }

  private detectTerminalInfo(): { bundleId?: string; appName?: string } | undefined {
    const termProgram = process.env.TERM_PROGRAM;
    if (!termProgram || termProgram === 'vscode') {
      return undefined;
    }

    if (termProgram === 'Apple_Terminal') {
      return { bundleId: 'com.apple.Terminal', appName: 'Terminal' };
    }

    if (termProgram === 'iTerm.app') {
      return { bundleId: 'com.googlecode.iterm2', appName: 'iTerm' };
    }

    if (termProgram === 'Hyper') {
      return { bundleId: 'co.zeit.hyper', appName: 'Hyper' };
    }

    if (termProgram === 'WarpTerminal') {
      return { bundleId: 'dev.warp.Warp-Terminal', appName: 'Warp' };
    }

    return undefined;
  }

  private isActivationResponse(response?: string, activationType?: string): boolean {
    const normalizedResponse = (response ?? '').toLowerCase().trim();
    const normalizedActivationType = (activationType ?? '').toLowerCase().trim();

    return (
      normalizedResponse === 'activate' ||
      normalizedResponse === 'clicked' ||
      normalizedActivationType === 'activate' ||
      normalizedActivationType === 'clicked'
    );
  }
}
