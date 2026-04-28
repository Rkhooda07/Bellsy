import * as vscode from 'vscode';

import { AgentEvent } from '../core/types';

export class StatusBarService implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private pendingEvents: AgentEvent[] = [];
  private pulseVisible = true;
  private pulseTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.item.command = 'agentNotifier.showPendingList';
    this.setIdle();
    this.item.show();
  }

  addPending(event: AgentEvent): void {
    this.pendingEvents = [...this.pendingEvents, event];
    this.render();
  }

  removePending(eventId: string): void {
    this.pendingEvents = this.pendingEvents.filter((event) => event.id !== eventId);
    this.render();
  }

  getPendingEvents(): AgentEvent[] {
    return [...this.pendingEvents];
  }

  private render(): void {
    if (this.pendingEvents.length === 0) {
      this.stopPulse();
      this.setIdle();
      return;
    }

    this.startPulse();
    this.item.text = this.pulseVisible
      ? `$(bell-dot) Pingly approvals: ${this.pendingEvents.length}`
      : `$(bell) Pingly approvals: ${this.pendingEvents.length}`;
    this.item.color = new vscode.ThemeColor(
      this.pulseVisible ? 'statusBarItem.errorForeground' : 'statusBarItem.warningForeground',
    );
    this.item.backgroundColor = new vscode.ThemeColor(
      this.pulseVisible ? 'statusBarItem.warningBackground' : 'statusBarItem.prominentBackground',
    );
    this.item.tooltip = `${this.pendingEvents.length} local agent permission request(s) pending. Click to review.`;
  }

  private setIdle(): void {
    this.item.text = '$(check) Pingly Ready';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'Pingly is listening for local agent events';
  }

  private startPulse(): void {
    if (this.pulseTimer) {
      return;
    }

    this.pulseTimer = setInterval(() => {
      this.pulseVisible = !this.pulseVisible;
      if (this.pendingEvents.length > 0) {
        this.render();
      }
    }, 900);
  }

  private stopPulse(): void {
    this.pulseVisible = true;
    if (!this.pulseTimer) {
      return;
    }

    clearInterval(this.pulseTimer);
    this.pulseTimer = null;
  }

  dispose(): void {
    this.stopPulse();
    this.item.dispose();
  }
}
