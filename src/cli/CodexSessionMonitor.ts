import * as fs from 'fs/promises';
import * as path from 'path';

import { AgentEventPriority, AgentEventType } from '../core/types';

import { DetectedCliEvent } from './PatternDetector';

type CodexSessionMonitorOptions = {
  sessionsRoot: string;
  cwd: string;
  startedAtMs: number;
  agent: string;
  pollIntervalMs?: number;
};

export class CodexSessionMonitor {
  private readonly pollIntervalMs: number;
  private readonly seenTurnIds = new Set<string>();
  private activeFilePath?: string;
  private fileOffset = 0;
  private pendingText = '';
  private timer?: NodeJS.Timeout;
  private inFlight = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly options: CodexSessionMonitorOptions,
    private readonly onEvent: (event: DetectedCliEvent) => Promise<void> | void,
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    const tick = (): void => {
      this.inFlight = this.inFlight.then(() => this.pollOnce());
    };

    tick();
    this.timer = setInterval(tick, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.inFlight;
  }

  async flush(): Promise<void> {
    await this.pollOnce();
    await this.inFlight;
  }

  private async pollOnce(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (!this.activeFilePath) {
      this.activeFilePath = await this.findActiveSessionFile();
      if (!this.activeFilePath) {
        return;
      }
    }

    try {
      const stats = await fs.stat(this.activeFilePath);
      if (stats.size <= this.fileOffset) {
        return;
      }

      const handle = await fs.open(this.activeFilePath, 'r');
      try {
        const length = stats.size - this.fileOffset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, this.fileOffset);
        this.fileOffset = stats.size;
        await this.processChunk(buffer.toString('utf8'));
      } finally {
        await handle.close();
      }
    } catch {
      // Ignore transient read errors while the session file is still being created or rotated.
    }
  }

  private async processChunk(chunk: string): Promise<void> {
    this.pendingText += chunk;

    while (true) {
      const newlineIndex = this.pendingText.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = this.pendingText.slice(0, newlineIndex).trim();
      this.pendingText = this.pendingText.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      const event = parseCodexSessionLine(line, this.options.agent, this.options.startedAtMs);
      if (!event) {
        continue;
      }

      if (event.correlationId && this.seenTurnIds.has(event.correlationId)) {
        continue;
      }

      if (event.correlationId) {
        this.seenTurnIds.add(event.correlationId);
      }

      await this.onEvent(event);
    }
  }

  private async findActiveSessionFile(): Promise<string | undefined> {
    const candidateDirs = buildCandidateDirs(this.options.sessionsRoot, this.options.startedAtMs);
    const files: Array<{ filePath: string; mtimeMs: number }> = [];

    for (const directory of candidateDirs) {
      try {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
            continue;
          }

          const filePath = path.join(directory, entry.name);
          const stats = await fs.stat(filePath);
          if (stats.mtimeMs < this.options.startedAtMs - 15_000) {
            continue;
          }

          files.push({ filePath, mtimeMs: stats.mtimeMs });
        }
      } catch {
        // Ignore missing day folders.
      }
    }

    files.sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const file of files.slice(0, 8)) {
      if (await isMatchingCodexSession(file.filePath, this.options.cwd, this.options.startedAtMs)) {
        return file.filePath;
      }
    }

    return undefined;
  }
}

export function parseCodexSessionLine(
  line: string,
  agent: string,
  startedAtMs: number,
): DetectedCliEvent | null {
  let record: Record<string, unknown>;

  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (record.type !== 'event_msg') {
    return null;
  }

  const timestampValue = record.timestamp;
  const timestampMs = typeof timestampValue === 'string' ? Date.parse(timestampValue) : Number.NaN;
  if (Number.isNaN(timestampMs) || timestampMs < startedAtMs - 15_000) {
    return null;
  }

  const payload = record.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  if (payloadRecord.type !== 'task_complete') {
    return null;
  }

  const turnId = typeof payloadRecord.turn_id === 'string' ? payloadRecord.turn_id : undefined;
  const lastAgentMessage =
    typeof payloadRecord.last_agent_message === 'string' ? payloadRecord.last_agent_message : undefined;

  return {
    type: AgentEventType.TASK_COMPLETED,
    priority: AgentEventPriority.LOW,
    confidence: 'high',
    correlationId: turnId ? `codex-turn:${turnId}` : undefined,
    message: buildCompletionMessage(lastAgentMessage),
  };
}

function buildCompletionMessage(lastAgentMessage?: string): string {
  const summary = summarizeAgentMessage(lastAgentMessage);
  if (!summary) {
    return 'Response completed';
  }

  return summary;
}

function summarizeAgentMessage(message?: string): string | null {
  if (!message) {
    return null;
  }

  const line = message
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith('```'));

  if (!line) {
    return null;
  }

  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function buildCandidateDirs(root: string, startedAtMs: number): string[] {
  const offsets = [-86_400_000, 0, 86_400_000];
  const directories = new Set<string>();

  for (const offset of offsets) {
    const date = new Date(startedAtMs + offset);
    const directory = path.join(
      root,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    );
    directories.add(directory);
  }

  return [...directories];
}

async function isMatchingCodexSession(filePath: string, cwd: string, startedAtMs: number): Promise<boolean> {
  try {
    const firstLine = await readFirstNonEmptyLine(filePath);
    if (!firstLine) {
      return false;
    }

    const record = JSON.parse(firstLine) as Record<string, unknown>;
    if (record.type !== 'session_meta') {
      return false;
    }

    const payload = record.payload as Record<string, unknown> | undefined;
    const sessionCwd = payload && typeof payload.cwd === 'string' ? payload.cwd : undefined;
    const timestamp = payload && typeof payload.timestamp === 'string' ? Date.parse(payload.timestamp) : Number.NaN;

    return sessionCwd === cwd && !Number.isNaN(timestamp) && timestamp >= startedAtMs - 15_000;
  } catch {
    return false;
  }
}

async function readFirstNonEmptyLine(filePath: string): Promise<string | undefined> {
  const handle = await fs.open(filePath, 'r');
  try {
    const maxBytes = 256 * 1024;
    const chunkSize = 4096;
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < maxBytes) {
      const remaining = maxBytes - offset;
      const buffer = Buffer.alloc(Math.min(chunkSize, remaining));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      if (bytesRead === 0) {
        break;
      }

      const chunk = buffer.subarray(0, bytesRead);
      chunks.push(chunk);
      offset += bytesRead;

      if (chunk.includes(0x0a)) {
        break;
      }
    }

    const head = Buffer.concat(chunks).toString('utf8');
    return head
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);
  } finally {
    await handle.close();
  }
}
