import { AgentEvent, PermissionResponse } from '../core/types';

import { NotificationService } from './NotificationService';
import { OutputChannelLogger } from './OutputChannelLogger';
import { ResponseDispatcher } from './ResponseDispatcher';
import { SoundService } from './SoundService';
import { StatusBarService } from './StatusBarService';
import { SystemNotifService } from './SystemNotifService';

export class PermissionManager {
  private readonly pending = new Map<string, AgentEvent>();
  private reminderTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly systemNotifService: SystemNotifService,
    private readonly soundService: SoundService,
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
      const choice = await this.awaitUserChoice(event.message);

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

  private async awaitUserChoice(message: string): Promise<'Allow' | 'Deny'> {
    return new Promise((resolve) => {
      let settled = false;

      const settle = (choice: 'Allow' | 'Deny' | undefined): void => {
        if (settled || !choice) {
          return;
        }

        settled = true;
        resolve(choice);
      };

      void this.notificationService.showPermissionRequest(message).then(settle).catch(() => undefined);
      void this.systemNotifService.showPermissionRequest(message).then(settle).catch(() => undefined);

      if (!this.systemNotifService.usesNativeSound()) {
        this.soundService.playPermissionAlert();
      }
    });
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
