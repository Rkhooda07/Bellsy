import * as path from 'path';
import * as vscode from 'vscode';

import EventBus from './core/EventBus';
import { EventRouter } from './core/EventRouter';
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_CURSOR_WEBHOOK_SECRET,
  DEFAULT_HTTP_RESPONSE_TIMEOUT_MS,
  DEFAULT_PERMISSION_REMINDER_ENABLED,
  DEFAULT_PERMISSION_REMINDER_INTERVAL_SECONDS,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_WATCH_FILE_PATH,
  DEFAULT_WATCH_RESPONSE_FILE_PATH,
} from './core/constants';
import { AgentEventType } from './core/types';
import { NotificationEngine } from './services/NotificationEngine';
import { NotificationService } from './services/NotificationService';
import { OutputChannelLogger } from './services/OutputChannelLogger';
import { PermissionManager } from './services/PermissionManager';
import { IResponseTarget, ResponseDispatcher } from './services/ResponseDispatcher';
import { CursorSetupService } from './services/CursorSetupService';
import { HostedRelayService } from './relay/HostedRelayService';
import { SoundService } from './services/SoundService';
import { StatusBarService } from './services/StatusBarService';
import { SystemNotifService } from './services/SystemNotifService';
import { HttpTransport } from './transport/HttpTransport';
import { TransportFactory } from './transport/TransportFactory';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new OutputChannelLogger();
  const config = vscode.workspace.getConfiguration('agentNotifier');
  const notificationService = new NotificationService();
  const statusBarService = new StatusBarService();
  const dispatcher = new ResponseDispatcher();
  const eventRouter = new EventRouter();
  const relayBaseUrl = config.get<string>('relayBaseUrl', '').trim();
  const experimentalHostedRelayEnabled = config.get<boolean>('experimentalHostedRelayEnabled', false);
  const relayService = new HostedRelayService(context, logger, relayBaseUrl);
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
      relayBaseUrl,
      cursorWebhookSecret: config.get<string>('cursorWebhookSecret', DEFAULT_CURSOR_WEBHOOK_SECRET),
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
  const cursorSetupService = new CursorSetupService(
    logger,
    relayService,
    () => transport.getEventEndpoint?.(),
    (event) => {
      EventBus.emit(event.type, {
        id: `${event.correlationId ?? event.type}:${Date.now()}`,
        timestamp: Date.now(),
        metadata: {},
        ...event,
      });
    },
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

  EventBus.on(AgentEventType.ATTENTION_REQUIRED, (event) => {
    logger.info(`Attention required event received: ${event.message}`);
    notificationEngine.showAttentionRequired(event);
  });

  transport.onEvent((event) => {
    logger.info(`Event received: ${event.type} (${event.id})`);
    if (!eventRouter.shouldRoute(event)) {
      logger.warn(`Event dropped by router as duplicate or burst: ${event.type} (${event.id})`);
      return;
    }

    EventBus.emit(event.type, event);
  });

  relayService.onEventReceived((event) => {
    logger.info(`Relay event received: ${event.type} (${event.id})`);
    if (!eventRouter.shouldRoute(event)) {
      logger.warn(`Relay event dropped by router as duplicate or burst: ${event.type} (${event.id})`);
      return;
    }

    EventBus.emit(event.type, event);
  });

  relayService.onStatusDidChange((status) => {
    logger.info(`Relay status: ${status}`);
  });

  try {
    await transport.start();
    statusBarService.setListeningEndpoint(transport.getEventEndpoint?.());
    const activeEndpoint = transport.getEventEndpoint?.();
    if (activeEndpoint) {
      logger.info(`Local endpoint ready at ${activeEndpoint}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Activation failed while starting transport: ${message}`);
    logger.show();
    await notificationService.showError(`Failed to start AI Agent Notifier: ${message}`);
    throw error;
  }

  if (experimentalHostedRelayEnabled && relayBaseUrl) {
    void relayService.start();
  } else if (relayBaseUrl) {
    logger.info('Experimental hosted relay is configured but disabled. Local notifications remain active.');
  }

  context.subscriptions.push(
    logger,
    relayService,
    statusBarService,
    vscode.commands.registerCommand('agentNotifier.showLogs', () => {
      logger.show();
    }),
    vscode.commands.registerCommand('agentNotifier.runSelfTest', async () => {
      await notificationEngine.runSelfTest();
    }),
    vscode.commands.registerCommand('agentNotifier.configureRelayBaseUrl', async () => {
      const currentValue = config.get<string>('relayBaseUrl', '').trim();
      const nextValue = await vscode.window.showInputBox({
        title: 'Pingly: Hosted Relay URL (Experimental)',
        prompt: 'Enter the hosted relay base URL for experimental Cursor cloud-agent support',
        placeHolder: 'https://pingly-relay.your-subdomain.workers.dev',
        value: currentValue,
        ignoreFocusOut: true,
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return 'Relay base URL is required.';
          }

          try {
            const url = new URL(trimmed);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') {
              return 'Relay base URL must start with http:// or https://';
            }
          } catch {
            return 'Enter a valid URL.';
          }

          return null;
        },
      });

      if (!nextValue) {
        return;
      }

      await config.update('relayBaseUrl', nextValue.trim(), vscode.ConfigurationTarget.Global);
      logger.info(`Relay base URL updated to ${nextValue.trim()}. Reload Cursor to reconnect with the hosted relay.`);
      await vscode.window.showInformationMessage(
        'Hosted relay URL saved. Enable "Pingly: Experimental Hosted Relay Enabled" if you want the experimental Cursor cloud-agent relay.',
      );
    }),
    vscode.commands.registerCommand('agentNotifier.setupCursorWebhook', async () => {
      await cursorSetupService.run();
    }),
    vscode.commands.registerCommand('agentNotifier.testCursorWebhook', async () => {
      await cursorSetupService.testWebhook();
    }),
    vscode.commands.registerCommand('agentNotifier.showPendingList', async () => {
      const pendingEvents = permissionManager.getPendingEvents();

      if (pendingEvents.length === 0) {
        await vscode.window.showInformationMessage('No pending local agent permission requests.');
        return;
      }

      await vscode.window.showQuickPick(
        pendingEvents.map((event) => ({
          label: event.message,
          description: new Date(event.timestamp).toLocaleTimeString(),
          detail: event.id,
        })),
        {
          placeHolder: 'Pending local agent permission requests',
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

  logger.info('Pingly activated');
}

export function deactivate(): void {}
