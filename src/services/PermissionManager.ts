import { AgentEvent, PermissionResponse } from '../core/types';

import { NotificationService } from './NotificationService';
import { NotificationEngine } from './NotificationEngine';
import { OutputChannelLogger } from './OutputChannelLogger';
import { ResponseDispatcher } from './ResponseDispatcher';
import { StatusBarService } from './StatusBarService';

export class PermissionManager {
  private readonly pending = new Map<string, AgentEvent>();
  private reminderTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationEngine: NotificationEngine,
    private readonly statusBarService: StatusBarService,
    private readonly dispatcher: ResponseDispatcher,
    private readonly logger: OutputChannelLogger,
    private readonly reminderEnabled: boolean,
    private readonly reminderIntervalMs: number,
  ) {}

  async handle(event: AgentEvent): Promise<void> {
    this.pending.set(event.id, event);
    this.statusBarService.addPending(event);
    this.ensureReminderLoop();
    this.logger.info(`Permission requested: ${event.message}`);

    try {
      const choice = await this.notificationEngine.requestPermission(event);

      const response: PermissionResponse = {
        eventId: event.id,
        allowed: choice === 'Allow',
        respondedAt: Date.now(),
      };

      await this.dispatcher.dispatch(response);
      this.logger.info(`Permission response sent for ${event.id}: ${response.allowed ? 'allow' : 'deny'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Permission flow failed for ${event.id}: ${message}`);
      await this.notificationService.showError(`Failed to process permission request: ${message}`);
    } finally {
      this.pending.delete(event.id);
      this.statusBarService.removePending(event.id);
      this.stopReminderLoopIfIdle();
    }
  }

  getPendingEvents(): AgentEvent[] {
    return [...this.pending.values()];
  }

  private ensureReminderLoop(): void {
    if (!this.reminderEnabled || this.reminderTimer) {
      return;
    }

    this.reminderTimer = setInterval(() => {
      void this.sendReminder();
    }, this.reminderIntervalMs);
  }

  private stopReminderLoopIfIdle(): void {
    if (this.pending.size > 0 || !this.reminderTimer) {
      return;
    }

    clearInterval(this.reminderTimer);
    this.reminderTimer = null;
  }

  private async sendReminder(): Promise<void> {
    if (this.pending.size === 0) {
      this.stopReminderLoopIfIdle();
      return;
    }

    this.logger.info(`Permission reminder fired for ${this.pending.size} pending request(s)`);
    await this.notificationService.showPendingReminder(this.pending.size);
  }
}
