import * as path from 'path';
import * as vscode from 'vscode';

import EventBus from './core/EventBus';
import { EventRouter } from './core/EventRouter';
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTP_RESPONSE_TIMEOUT_MS,
  DEFAULT_PERMISSION_REMINDER_ENABLED,
  DEFAULT_PERMISSION_REMINDER_INTERVAL_SECONDS,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_WATCH_FILE_PATH,
  DEFAULT_WATCH_RESPONSE_FILE_PATH,
} from './core/constants';
import { AgentEventType } from './core/types';
import { AgentSimulator } from './simulation/AgentSimulator';
import { NotificationEngine } from './services/NotificationEngine';
import { NotificationService } from './services/NotificationService';
import { OutputChannelLogger } from './services/OutputChannelLogger';
import { PermissionManager } from './services/PermissionManager';
import { IResponseTarget, ResponseDispatcher } from './services/ResponseDispatcher';
import { SoundService } from './services/SoundService';
import { StatusBarService } from './services/StatusBarService';
import { SystemNotifService } from './services/SystemNotifService';
import { HttpTransport } from './transport/HttpTransport';
import { TransportFactory } from './transport/TransportFactory';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new OutputChannelLogger();
  const config = vscode.workspace.getConfiguration('agentNotifier');
  const simulator = new AgentSimulator();
  const notificationService = new NotificationService();
  const statusBarService = new StatusBarService();
  const dispatcher = new ResponseDispatcher();
  const eventRouter = new EventRouter();
  const soundService = new SoundService(
    path.join(context.extensionPath, 'sounds'),
    config.get<boolean>('soundEnabled', true),
    config.get<number>('soundVolume', DEFAULT_SOUND_VOLUME),
  );
  const systemNotifService = new SystemNotifService(context.extensionPath);
  const notificationEngine = new NotificationEngine(
    notificationService,
    systemNotifService,
    soundService,
    logger,
    () => vscode.window.state.focused,
  );
  const permissionManager = new PermissionManager(
    notificationService,
    notificationEngine,
    statusBarService,
    dispatcher,
    logger,
    config.get<boolean>('permissionReminderEnabled', DEFAULT_PERMISSION_REMINDER_ENABLED),
    config.get<number>('permissionReminderIntervalSeconds', DEFAULT_PERMISSION_REMINDER_INTERVAL_SECONDS) * 1000,
  );

  const transport = TransportFactory.create(
    {
      transport: config.get<'file' | 'http'>('transport', 'http'),
      httpPort: config.get<number>('httpPort', DEFAULT_HTTP_PORT),
      watchFilePath: config.get<string>('watchFilePath', DEFAULT_WATCH_FILE_PATH),
      watchResponseFilePath: config.get<string>('watchResponseFilePath', DEFAULT_WATCH_RESPONSE_FILE_PATH),
      soundEnabled: config.get<boolean>('soundEnabled', true),
      soundVolume: config.get<number>('soundVolume', DEFAULT_SOUND_VOLUME),
      httpResponseTimeoutMs: config.get<number>('httpResponseTimeoutMs', DEFAULT_HTTP_RESPONSE_TIMEOUT_MS),
      permissionReminderEnabled: config.get<boolean>(
        'permissionReminderEnabled',
        DEFAULT_PERMISSION_REMINDER_ENABLED,
      ),
      permissionReminderIntervalSeconds: config.get<number>(
        'permissionReminderIntervalSeconds',
        DEFAULT_PERMISSION_REMINDER_INTERVAL_SECONDS,
      ),
    },
    logger,
  );

  if (transport instanceof HttpTransport || 'send' in transport) {
    dispatcher.setTarget(transport as IResponseTarget);
  }

  EventBus.on(AgentEventType.PERMISSION_REQUIRED, (event) => {
    void permissionManager.handle(event);
  });

  EventBus.on(AgentEventType.TASK_COMPLETED, (event) => {
    logger.info(`Task completed event received: ${event.message}`);
    notificationEngine.showTaskCompleted(event);
  });

  transport.onEvent((event) => {
    logger.info(`Event received: ${event.type} (${event.id})`);
    if (!eventRouter.shouldRoute(event)) {
      logger.warn(`Event dropped by router as duplicate or burst: ${event.type} (${event.id})`);
      return;
    }

    EventBus.emit(event.type, event);
  });

  try {
    await transport.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Activation failed while starting transport: ${message}`);
    logger.show();
    await notificationService.showError(`Failed to start AI Agent Notifier: ${message}`);
    throw error;
  }

  context.subscriptions.push(
    logger,
    statusBarService,
    vscode.commands.registerCommand('agentNotifier.showLogs', () => {
      logger.show();
    }),
    vscode.commands.registerCommand('agentNotifier.runSelfTest', async () => {
      await notificationEngine.runSelfTest();
    }),
    vscode.commands.registerCommand('agentNotifier.showPendingList', async () => {
      const pendingEvents = permissionManager.getPendingEvents();

      if (pendingEvents.length === 0) {
        await vscode.window.showInformationMessage('No pending AI agent permission requests.');
        return;
      }

      await vscode.window.showQuickPick(
        pendingEvents.map((event) => ({
          label: event.message,
          description: new Date(event.timestamp).toLocaleTimeString(),
          detail: event.id,
        })),
        {
          placeHolder: 'Pending AI agent permission requests',
          canPickMany: false,
        },
      );
    }),
    {
      dispose: () => {
        void transport.stop();
      },
    },
  );

  logger.info('AI Agent Notifier activated');
}

export function deactivate(): void {}
