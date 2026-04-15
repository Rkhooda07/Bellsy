import { AgentEvent, PermissionResponse } from '../core/types';

import { NotificationService } from './NotificationService';
import { OutputChannelLogger } from './OutputChannelLogger';
import { ResponseDispatcher } from './ResponseDispatcher';
import { SoundService } from './SoundService';
import { StatusBarService } from './StatusBarService';
import { SystemNotifService } from './SystemNotifService';

export class PermissionManager {
  private readonly pending = new Map<string, AgentEvent>();

  constructor(
    private readonly notificationService: NotificationService,
    private readonly systemNotifService: SystemNotifService,
    private readonly soundService: SoundService,
    private readonly statusBarService: StatusBarService,
    private readonly dispatcher: ResponseDispatcher,
    private readonly logger: OutputChannelLogger,
  ) {}

  async handle(event: AgentEvent): Promise<void> {
    this.pending.set(event.id, event);
    this.statusBarService.addPending(event);
    this.logger.info(`Permission requested: ${event.message}`);

    try {
      const [choice] = await Promise.all([
        this.notificationService.showPermissionRequest(event.message),
        this.fireSideEffects(event.message),
      ]);

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
    }
  }

  getPendingEvents(): AgentEvent[] {
    return [...this.pending.values()];
  }

  private async fireSideEffects(message: string): Promise<void> {
    this.systemNotifService.notifyPermission(message);
    this.soundService.playPermissionAlert();
  }
}
