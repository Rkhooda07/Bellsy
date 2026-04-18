import * as fs from 'fs';
import * as path from 'path';

import { parseEvent } from '../core/EventValidator';
import { AgentEvent, PermissionResponse } from '../core/types';
import { OutputChannelLogger } from '../services/OutputChannelLogger';
import { IResponseTarget } from '../services/ResponseDispatcher';

import { ITransport } from './ITransport';

export class FileWatchTransport implements ITransport, IResponseTarget {
  private watcher?: fs.FSWatcher;
  private callback?: (event: AgentEvent) => void;
  private lastPayload = '';

  constructor(
    private readonly watchPath: string,
    private readonly responsePath: string,
    private readonly logger: OutputChannelLogger,
  ) {}

  async start(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.watchPath), { recursive: true });
    await fs.promises.mkdir(path.dirname(this.responsePath), { recursive: true });

    if (!fs.existsSync(this.watchPath)) {
      await fs.promises.writeFile(this.watchPath, '{}', 'utf8');
    }

    if (!fs.existsSync(this.responsePath)) {
      await fs.promises.writeFile(this.responsePath, '{}', 'utf8');
    }

    this.watcher = fs.watch(this.watchPath, () => {
      void this.readAndEmit();
    });

    this.logger.info(`File transport watching ${this.watchPath} and writing responses to ${this.responsePath}`);
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callback = callback;
  }

  async send(response: PermissionResponse): Promise<void> {
    await fs.promises.writeFile(this.responsePath, `${JSON.stringify(response, null, 2)}\n`, 'utf8');
    this.logger.info(`File transport wrote response for ${response.eventId}`);
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private async readAndEmit(): Promise<void> {
    try {
      const rawFile = await fs.promises.readFile(this.watchPath, 'utf8');
      if (rawFile === this.lastPayload) {
        return;
      }

      const rawPayload = JSON.parse(rawFile) as unknown;
      const event = parseEvent(rawPayload);
      this.lastPayload = rawFile;
      this.callback?.(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`File transport ignored invalid payload: ${message}`);
    }
  }
}
