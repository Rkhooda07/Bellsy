import * as vscode from 'vscode';

import { AgentEvent } from '../core/types';

export class StatusBarService implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private pendingEvents: AgentEvent[] = [];

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
      this.setIdle();
      return;
    }

    this.item.text = `$(bell) Waiting for permission (${this.pendingEvents.length})`;
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.item.tooltip = `${this.pendingEvents.length} AI agent permission request(s) pending`;
  }

  private setIdle(): void {
    this.item.text = '$(check) AI Agent Ready';
    this.item.color = undefined;
    this.item.tooltip = 'AI Agent Notifier is listening for events';
  }

  dispose(): void {
    this.item.dispose();
  }
}
