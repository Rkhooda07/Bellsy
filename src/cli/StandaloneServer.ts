import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import EventBus from '../core/EventBus';
import { AgentEventType } from '../core/types';
import { NotificationEngine } from '../services/NotificationEngine';
import { SoundService } from '../services/SoundService';
import { SystemNotifService } from '../services/SystemNotifService';
import { HttpTransport } from '../transport/HttpTransport';

export class StandaloneServer {
  private transport?: HttpTransport;

  constructor(
    private readonly port: number,
    private readonly extensionPath: string,
  ) {}

  async start(): Promise<void> {
    const logger = {
      info: (m: string) => console.log(`[INFO] ${m}`),
      warn: (m: string) => console.warn(`[WARN] ${m}`),
      error: (m: string) => console.error(`[ERROR] ${m}`),
      show: () => {},
    } as any;

    const soundService = new SoundService(
      [path.join(this.extensionPath, 'media', 'sounds'), path.join(this.extensionPath, 'sounds')],
      true, // soundEnabled
      45,   // volume
      () => 'focus' // lock to focus mode as requested
    );

    const systemNotifService = new SystemNotifService(
      this.extensionPath,
      'Bellsy',
    );

    const notificationEngine = new NotificationEngine(
      null as any, // No VS Code notification service in standalone
      systemNotifService,
      soundService,
      logger,
      () => false, // In standalone, we assume we are not "focused" in an editor
    );

    this.transport = new HttpTransport(
      this.port,
      300000, // 5 min timeout
      logger,
    );

    EventBus.on(AgentEventType.TASK_COMPLETED, (event) => {
      notificationEngine.showTaskCompleted(event);
    });

    EventBus.on(AgentEventType.ATTENTION_REQUIRED, (event) => {
      notificationEngine.showAttentionRequired(event);
    });

    EventBus.on(AgentEventType.PERMISSION_REQUIRED, (event) => {
      // Standalone permission handling is currently non-interactive via system notif
      // but we still trigger the notification/sound
      notificationEngine.showAttentionRequired({
        ...event,
        type: AgentEventType.ATTENTION_REQUIRED, // Map to attention for standalone
        message: `Permission Required: ${event.message}`
      });
    });

    this.transport.onEvent((event) => {
      EventBus.emit(event.type, event);
    });

    await this.transport.start();
    console.log(`Bellsy Standalone Server listening on port ${this.port}`);
  }

  async stop(): Promise<void> {
    await this.transport?.stop();
  }
}
