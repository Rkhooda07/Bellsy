import { AgentEvent, AgentEventPriority } from '../core/types';

import { NotificationService } from './NotificationService';
import { OutputChannelLogger } from './OutputChannelLogger';
import { SoundService } from './SoundService';
import { SystemNotifService } from './SystemNotifService';

type PermissionChoice = 'Allow' | 'Deny';

export class NotificationEngine {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly systemNotifService: SystemNotifService,
    private readonly soundService: SoundService,
    private readonly logger: OutputChannelLogger,
    private readonly isFocused: () => boolean,
    private readonly openLogs: () => void = () => undefined,
  ) {}

  async requestPermission(event: AgentEvent): Promise<PermissionChoice> {
    const critical = this.shouldUseProminentSystemNotification();
    this.logger.info(
      `Dispatching permission notification for ${event.id} from ${event.source} ` +
        `(focused=${this.isFocused()}, critical=${critical})`,
    );

    return new Promise((resolve) => {
      let settled = false;

      const settle = (choice: PermissionChoice | undefined): void => {
        if (settled || !choice) {
          return;
        }

        settled = true;
        resolve(choice);
      };

      void this.notificationService.showPermissionRequest(this.formatMessage(event)).then(settle).catch(() => undefined);
      void this.systemNotifService
        .showPermissionRequest(this.formatMessage(event), critical)
        .then(settle)
        .catch(() => undefined);

      if (!this.systemNotifService.usesNativeSound()) {
        this.soundService.playPermissionAlert();
      }
    });
  }

  showTaskCompleted(event: AgentEvent): void {
    const critical = this.shouldUseProminentSystemNotification();
    this.logger.info(
      `Dispatching completion notification for ${event.id} from ${event.source} ` +
        `(focused=${this.isFocused()}, critical=${critical})`,
    );

    void this.notificationService
      .showTaskCompleted(this.formatMessage(event))
      .then((action) => this.handleNotificationAction(action), () => undefined);
    this.systemNotifService.notifyCompletion(this.formatMessage(event), critical);

    if (!this.systemNotifService.usesNativeSound()) {
      this.soundService.playTaskComplete();
    }
  }

  showAttentionRequired(event: AgentEvent): void {
    const critical = this.shouldUseProminentSystemNotification();
    this.logger.info(
      `Dispatching attention notification for ${event.id} from ${event.source} ` +
        `(focused=${this.isFocused()}, critical=${critical})`,
    );

    void this.notificationService
      .showAttentionRequired(this.formatMessage(event))
      .then((action) => this.handleNotificationAction(action), () => undefined);
    this.systemNotifService.notifyAttention(this.formatMessage(event), critical);

    if (!this.systemNotifService.usesNativeSound()) {
      this.soundService.playPermissionAlert();
    }
  }

  async runSelfTest(): Promise<void> {
    this.logger.info('Running notification self-test');
    await this.notificationService.showTaskCompleted('Self test: in-editor notification is working');
    this.systemNotifService.notifyCompletion('Self test: system notification is working', true);

    if (!this.systemNotifService.usesNativeSound()) {
      this.soundService.playTaskComplete();
    }
  }

  private shouldUseProminentSystemNotification(): boolean {
    return true;
  }

  private formatMessage(event: AgentEvent): string {
    if (!event.agent) {
      return event.message;
    }

    const normalizedPrefix = `${event.agent}:`;
    if (event.message.toLowerCase().startsWith(normalizedPrefix.toLowerCase())) {
      return event.message;
    }

    return `${event.agent}: ${event.message}`;
  }

  private handleNotificationAction(action: string | undefined): void {
    if (action === 'Open Logs') {
      this.openLogs();
    }
  }
}
