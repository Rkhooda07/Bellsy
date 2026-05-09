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
} from './core/constants';
import { AgentEvent, AgentEventType } from './core/types';
import { NotificationEngine } from './services/NotificationEngine';
import { NotificationService } from './services/NotificationService';
import { OutputChannelLogger } from './services/OutputChannelLogger';
import { PermissionManager } from './services/PermissionManager';
import { IResponseTarget, ResponseDispatcher } from './services/ResponseDispatcher';
import { CursorSetupService } from './services/CursorSetupService';
import { SoundService, getSoundMode } from './services/SoundService';
import { StatusBarService } from './services/StatusBarService';
import { SystemNotifService } from './services/SystemNotifService';
import { HttpTransport } from './transport/HttpTransport';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new OutputChannelLogger();
  const config = vscode.workspace.getConfiguration('bellsy');
  const notificationService = new NotificationService();
  const statusBarService = new StatusBarService();
  const dispatcher = new ResponseDispatcher();
  const eventRouter = new EventRouter();
  const notificationClickUri = vscode.Uri.parse(
    `${vscode.env.uriScheme}://${context.extension.id}/notification-click?target=agent`,
  );
  const focusAgentSurface = async (): Promise<void> => {
    const terminal = vscode.window.activeTerminal ?? vscode.window.terminals.at(-1);

    if (terminal) {
      terminal.show(false);
      await vscode.commands.executeCommand('workbench.action.terminal.focus');
      return;
    }

    if (vscode.window.activeTextEditor) {
      await vscode.window.showTextDocument(vscode.window.activeTextEditor.document, {
        preserveFocus: false,
        preview: false,
        viewColumn: vscode.window.activeTextEditor.viewColumn,
      });
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      return;
    }

    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  };
  const soundService = new SoundService(
    [path.join(context.extensionPath, 'media', 'sounds'), path.join(context.extensionPath, 'sounds')],
    config.get<boolean>('soundEnabled', true),
    config.get<number>('soundVolume', DEFAULT_SOUND_VOLUME),
  );
  const systemNotifService = new SystemNotifService(
    context.extensionPath,
    vscode.env.appName,
    notificationClickUri.toString(),
    () => {
      void focusAgentSurface();
    },
  );
  const notificationEngine = new NotificationEngine(
    notificationService,
    systemNotifService,
    soundService,
    logger,
    () => vscode.window.state.focused,
    () => logger.show(),
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

  const transport = new HttpTransport(
    config.get<number>('httpPort', DEFAULT_HTTP_PORT),
    config.get<number>('httpResponseTimeoutMs', DEFAULT_HTTP_RESPONSE_TIMEOUT_MS),
    logger,
  );
  const cursorSetupService = new CursorSetupService(
    logger,
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

  const registerEventHandler = (type: AgentEventType, listener: (event: AgentEvent) => void): void => {
    EventBus.on(type, listener);
    context.subscriptions.push(
      new vscode.Disposable(() => {
        EventBus.off(type, listener);
      }),
    );
  };

  registerEventHandler(AgentEventType.PERMISSION_REQUIRED, (event) => {
    void permissionManager.handle(event);
  });

  registerEventHandler(AgentEventType.TASK_COMPLETED, (event) => {
    logger.info(`Task completed event received: ${event.message}`);
    notificationEngine.showTaskCompleted(event);
  });

  registerEventHandler(AgentEventType.ATTENTION_REQUIRED, (event) => {
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
    await notificationService.showError(`Failed to start Bellsy: ${message}`);
    throw error;
  }

  context.subscriptions.push(
    logger,
    statusBarService,
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        if (uri.authority !== context.extension.id || uri.path !== '/notification-click') {
          return;
        }

        logger.info(`Notification click received via ${uri.toString(true)}`);
        await focusAgentSurface();
      },
    }),
    vscode.commands.registerCommand('bellsy.showLogs', () => {
      logger.show();
    }),
    vscode.commands.registerCommand('bellsy.setupLocalNotifications', async () => {
      await cursorSetupService.run();
    }),
    vscode.commands.registerCommand('bellsy.testLocalNotifications', async () => {
      await cursorSetupService.testWebhook();
    }),
    vscode.commands.registerCommand('bellsy.toggleSoundMode', async () => {
      const soundConfig = vscode.workspace.getConfiguration('bellsy');
      const current = getSoundMode();
      const selection = await vscode.window.showQuickPick(
        [
          {
            label: 'Focus',
            description: current === 'focus' ? 'Current default' : 'Professional sounds',
            mode: 'focus' as const,
          },
          {
            label: 'Vibe',
            description: current === 'vibe' ? 'Current' : 'Fun sounds',
            mode: 'vibe' as const,
          },
        ],
        {
          title: 'Bellsy: Sound Mode',
          placeHolder: 'Choose the sound style for completion and permission alerts',
          canPickMany: false,
        },
      );

      if (!selection) {
        return;
      }

      if (selection.mode !== current) {
        await soundConfig.update('soundMode', selection.mode, vscode.ConfigurationTarget.Global);
      }

      soundService.playTaskCompletePreview(selection.mode);
      if (selection.mode !== current) {
        void vscode.window.showInformationMessage(`Bellsy sound mode: ${selection.mode}`);
      }
    }),
    vscode.commands.registerCommand('bellsy.showPendingList', async () => {
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

  logger.info('Bellsy activated');
}

export function deactivate(): void {}
