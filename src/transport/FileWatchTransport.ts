import * as fs from 'fs';
import * as path from 'path';

import { parseEvent } from '../core/EventValidator';
import { AgentEvent } from '../core/types';
import { OutputChannelLogger } from '../services/OutputChannelLogger';

import { ITransport } from './ITransport';

export class FileWatchTransport implements ITransport {
  private watcher?: fs.FSWatcher;
  private callback?: (event: AgentEvent) => void;

  constructor(
    private readonly watchPath: string,
    private readonly logger: OutputChannelLogger,
  ) {}

  async start(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.watchPath), { recursive: true });

    if (!fs.existsSync(this.watchPath)) {
      await fs.promises.writeFile(this.watchPath, '{}', 'utf8');
    }

    this.watcher = fs.watch(this.watchPath, () => {
      void this.readAndEmit();
    });

    this.logger.info(`File transport watching ${this.watchPath}`);
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callback = callback;
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private async readAndEmit(): Promise<void> {
    try {
      const rawFile = await fs.promises.readFile(this.watchPath, 'utf8');
      const rawPayload = JSON.parse(rawFile) as unknown;
      const event = parseEvent(rawPayload);
      this.callback?.(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`File transport ignored invalid payload: ${message}`);
    }
  }
}
