import * as vscode from 'vscode';

import { OUTPUT_CHANNEL_NAME } from '../core/constants';

export class OutputChannelLogger implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  info(message: string): void {
    this.output.appendLine(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.output.appendLine(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.output.appendLine(`[ERROR] ${message}`);
  }

  show(): void {
    this.output.show(true);
  }

  dispose(): void {
    this.output.dispose();
  }
}
