import * as path from 'path';
import * as vscode from 'vscode';

import EventBus from './core/EventBus';
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTP_RESPONSE_TIMEOUT_MS,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_WATCH_FILE_PATH,
} from './core/constants';
import { AgentEventType } from './core/types';
import { AgentSimulator } from './simulation/AgentSimulator';
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
  const soundService = new SoundService(
    path.join(context.extensionPath, 'sounds'),
    config.get<boolean>('soundEnabled', true),
    config.get<number>('soundVolume', DEFAULT_SOUND_VOLUME),
  );
  const systemNotifService = new SystemNotifService(context.extensionPath);
  const permissionManager = new PermissionManager(
    notificationService,
    systemNotifService,
    soundService,
    statusBarService,
    dispatcher,
    logger,
  );

  const transport = TransportFactory.create(
    {
      transport: config.get<'file' | 'http'>('transport', 'http'),
      httpPort: config.get<number>('httpPort', DEFAULT_HTTP_PORT),
      watchFilePath: config.get<string>('watchFilePath', DEFAULT_WATCH_FILE_PATH),
      soundEnabled: config.get<boolean>('soundEnabled', true),
      soundVolume: config.get<number>('soundVolume', DEFAULT_SOUND_VOLUME),
      httpResponseTimeoutMs: config.get<number>('httpResponseTimeoutMs', DEFAULT_HTTP_RESPONSE_TIMEOUT_MS),
    },
    logger,
  );

  if (transport instanceof HttpTransport) {
    dispatcher.setTarget(transport as IResponseTarget);
  }

  EventBus.on(AgentEventType.PERMISSION_REQUIRED, (event) => {
    void permissionManager.handle(event);
  });

  EventBus.on(AgentEventType.TASK_COMPLETED, (event) => {
    logger.info(`Task completed event received: ${event.message}`);
    void notificationService.showTaskCompleted(event.message);
    systemNotifService.notifyCompletion(event.message);

    if (!systemNotifService.usesNativeSound()) {
      soundService.playTaskComplete();
    }
  });

  transport.onEvent((event) => {
    logger.info(`Event received: ${event.type} (${event.id})`);
    EventBus.emit(event.type, event);
  });

  await transport.start();

  context.subscriptions.push(
    logger,
    statusBarService,
    vscode.commands.registerCommand('agentNotifier.simulatePermission', () => {
      simulator.emitPermissionRequest();
    }),
    vscode.commands.registerCommand('agentNotifier.simulateComplete', () => {
      simulator.emitTaskCompleted();
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
