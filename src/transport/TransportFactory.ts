import * as vscode from 'vscode';

import {
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTP_RESPONSE_TIMEOUT_MS,
  DEFAULT_PERMISSION_REMINDER_ENABLED,
  DEFAULT_PERMISSION_REMINDER_INTERVAL_SECONDS,
  DEFAULT_WATCH_FILE_PATH,
} from '../core/constants';
import { AgentNotifierConfig } from '../core/types';
import { OutputChannelLogger } from '../services/OutputChannelLogger';

import { FileWatchTransport } from './FileWatchTransport';
import { HttpTransport } from './HttpTransport';
import { ITransport } from './ITransport';

export class TransportFactory {
  static create(config: AgentNotifierConfig, logger: OutputChannelLogger): ITransport {
    if (config.transport === 'file') {
      return new FileWatchTransport(config.watchFilePath || DEFAULT_WATCH_FILE_PATH, logger);
    }

    return new HttpTransport(
      config.httpPort || DEFAULT_HTTP_PORT,
      config.httpResponseTimeoutMs || DEFAULT_HTTP_RESPONSE_TIMEOUT_MS,
      logger,
    );
  }

  static fromWorkspace(logger: OutputChannelLogger): ITransport {
    const config = vscode.workspace.getConfiguration('agentNotifier');

    return TransportFactory.create(
      {
        transport: config.get<'file' | 'http'>('transport', 'http'),
        httpPort: config.get<number>('httpPort', DEFAULT_HTTP_PORT),
        watchFilePath: config.get<string>('watchFilePath', DEFAULT_WATCH_FILE_PATH),
        soundEnabled: config.get<boolean>('soundEnabled', true),
        soundVolume: config.get<number>('soundVolume', 100),
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
  }
}
