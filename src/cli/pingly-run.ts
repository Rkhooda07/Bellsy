#!/usr/bin/env node
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

import { CodexSessionMonitor } from './CodexSessionMonitor';
import { DetectedCliEvent, PatternDetector } from './PatternDetector';

type CliOptions = {
  agent: string;
  endpoint: string;
  allowInput: string;
  denyInput: string;
  ttyMode: 'auto' | 'on' | 'off';
  command: string;
  args: string[];
};

type SpawnPlan =
  | {
      kind: 'pipe';
      command: string;
      args: string[];
    }
  | {
      kind: 'tty-log';
      command: string;
      args: string[];
      logFilePath: string;
    };

const DEFAULT_ENDPOINT = 'http://127.0.0.1:9001/event';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const detector = new PatternDetector({ agent: options.agent });
  const plan = buildSpawnPlan(options);
  const runId = randomUUID();

  if (plan.kind === 'tty-log') {
    await runWithTerminalCapture(plan, detector, options, runId);
    return;
  }

  await runWithPipes(plan, detector, options, runId);
}

async function runWithPipes(
  plan: Extract<SpawnPlan, { kind: 'pipe' }>,
  detector: PatternDetector,
  options: CliOptions,
  runId: string,
): Promise<void> {
  const child = spawn(plan.command, plan.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    void handleDetectedEvents(detector.ingest(chunk.toString('utf8')), options, runId, child.stdin);
  });

  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    void handleDetectedEvents(detector.ingest(chunk.toString('utf8')), options, runId, child.stdin);
  });

  child.on('error', (error) => {
    console.error(`[pingly-run] Failed to start ${plan.command}: ${error.message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    void handleDetectedEvents(detector.onExit(code), options, runId, child.stdin).finally(() => {
      process.exit(code ?? 1);
    });
  });
}

async function runWithTerminalCapture(
  plan: Extract<SpawnPlan, { kind: 'tty-log' }>,
  detector: PatternDetector,
  options: CliOptions,
  runId: string,
): Promise<void> {
  await fs.writeFile(plan.logFilePath, '');
  const startedAtMs = Date.now();

  const child = spawn(plan.command, plan.args, {
    stdio: 'inherit',
    env: process.env,
  });

  const poller = startLogPolling(plan.logFilePath, async (chunk) => {
    const events = detector.ingest(chunk);
    await handleDetectedEvents(events, options, runId);
  });
  const sessionMonitor = shouldMonitorCodexSession(options)
    ? new CodexSessionMonitor(
        {
          sessionsRoot: path.join(os.homedir(), '.codex', 'sessions'),
          cwd: process.cwd(),
          startedAtMs,
          agent: options.agent,
        },
        async (event) => {
          await handleDetectedEvents([event], options, runId);
        },
      )
    : undefined;
  sessionMonitor?.start();

  child.on('error', async (error) => {
    await sessionMonitor?.stop();
    await poller.stop();
    await fs.rm(plan.logFilePath, { force: true });
    console.error(`[pingly-run] Failed to start ${plan.command}: ${error.message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    void Promise.all([poller.flush(), sessionMonitor?.flush()])
      .then(() => handleDetectedEvents(exitEventsFor(options, detector, code), options, runId))
      .finally(async () => {
        await sessionMonitor?.stop();
        await poller.stop();
        await fs.rm(plan.logFilePath, { force: true });
        process.exit(code ?? 1);
      });
  });
}

function parseArgs(args: string[]): CliOptions {
  let agent = process.env.PINGLY_AGENT ?? 'unknown';
  let endpoint = process.env.PINGLY_URL ?? DEFAULT_ENDPOINT;
  let allowInput = process.env.PINGLY_ALLOW_INPUT ?? 'y\n';
  let denyInput = process.env.PINGLY_DENY_INPUT ?? 'n\n';
  let ttyMode = (process.env.PINGLY_TTY_MODE as CliOptions['ttyMode'] | undefined) ?? 'auto';
  const commandSeparatorIndex = args.indexOf('--');

  if (commandSeparatorIndex === -1) {
    printUsageAndExit();
  }

  const wrapperArgs = args.slice(0, commandSeparatorIndex);
  for (let index = 0; index < wrapperArgs.length; index += 1) {
    const arg = wrapperArgs[index];
    const value = wrapperArgs[index + 1];

    if (arg === '--agent' && value) {
      agent = value;
      index += 1;
      continue;
    }

    if (arg === '--endpoint' && value) {
      endpoint = value;
      index += 1;
      continue;
    }

    if (arg === '--allow-input' && value) {
      allowInput = decodeInput(value);
      index += 1;
      continue;
    }

    if (arg === '--deny-input' && value) {
      denyInput = decodeInput(value);
      index += 1;
      continue;
    }

    if (arg === '--tty' && value) {
      if (value !== 'auto' && value !== 'on' && value !== 'off') {
        printUsageAndExit();
      }

      ttyMode = value;
      index += 1;
      continue;
    }

    printUsageAndExit();
  }

  const commandParts = args.slice(commandSeparatorIndex + 1);
  const command = commandParts[0];
  if (!command) {
    printUsageAndExit();
  }

  return {
    agent,
    endpoint,
    allowInput,
    denyInput,
    ttyMode,
    command,
    args: commandParts.slice(1),
  };
}

function buildSpawnPlan(options: CliOptions): SpawnPlan {
  if (!shouldWrapInTerminal(options)) {
    return {
      kind: 'pipe',
      command: options.command,
      args: options.args,
    };
  }

  if (os.platform() === 'darwin' || os.platform() === 'linux') {
    const logFilePath = path.join(os.tmpdir(), `pingly-run-${Date.now()}-${Math.random().toString(16).slice(2)}.log`);
    return {
      kind: 'tty-log',
      command: 'script',
      args: ['-q', logFilePath, options.command, ...options.args],
      logFilePath,
    };
  }

  return {
    kind: 'pipe',
    command: options.command,
    args: options.args,
  };
}

function shouldWrapInTerminal(options: CliOptions): boolean {
  if (options.ttyMode === 'off') {
    return false;
  }

  if (options.ttyMode === 'on') {
    return true;
  }

  return /^(codex|claude|claude-code)$/i.test(options.command) || /^(codex|claude|claude-code)$/i.test(options.agent);
}

function shouldMonitorCodexSession(options: CliOptions): boolean {
  if (!/^(codex)$/i.test(options.command) && !/^(codex)$/i.test(options.agent)) {
    return false;
  }

  const firstArg = options.args[0]?.toLowerCase();
  return !firstArg || !NON_INTERACTIVE_CODEX_SUBCOMMANDS.has(firstArg);
}

function exitEventsFor(options: CliOptions, detector: PatternDetector, exitCode: number | null): DetectedCliEvent[] {
  if (shouldMonitorCodexSession(options) && exitCode === 0) {
    return [];
  }

  return detector.onExit(exitCode);
}

async function handleDetectedEvents(
  events: DetectedCliEvent[],
  options: CliOptions,
  runId: string,
  stdin?: NodeJS.WritableStream,
): Promise<void> {
  for (const event of events) {
    const response = await postEvent(event, options, runId);
    if (
      stdin &&
      event.type === AgentEventType.PERMISSION_REQUIRED &&
      response &&
      typeof response.allowed === 'boolean'
    ) {
      stdin.write(response.allowed ? options.allowInput : options.denyInput);
    }
  }
}

async function postEvent(
  event: DetectedCliEvent,
  options: CliOptions,
  runId: string,
): Promise<{ allowed?: boolean } | null> {
  const correlationId = event.correlationId ?? `${runId}:${event.type}:${randomUUID()}`;
  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: event.type,
      source: AgentEventSource.CLI,
      priority: event.priority,
      agent: options.agent,
      message: event.message,
      correlationId,
      metadata: {
        confidence: event.confidence,
        wrapper: 'pingly-run',
      },
    }),
  }).catch((error: Error) => {
    console.error(`[pingly-run] Failed to notify Pingly: ${error.message}`);
    return null;
  });

  if (!response) {
    return null;
  }

  if (!response.ok) {
    console.error(`[pingly-run] Notification failed: HTTP ${response.status}`);
    return null;
  }

  return (await response.json().catch(() => null)) as { allowed?: boolean } | null;
}

const NON_INTERACTIVE_CODEX_SUBCOMMANDS = new Set([
  'exec',
  'review',
  'login',
  'logout',
  'mcp',
  'plugin',
  'mcp-server',
  'app-server',
  'app',
  'completion',
  'sandbox',
  'debug',
  'apply',
  'resume',
  'fork',
  'cloud',
  'exec-server',
  'features',
  'help',
]);

function decodeInput(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function printUsageAndExit(): never {
  console.error(
    'Usage: pingly-run [--agent name] [--endpoint url] [--allow-input value] [--deny-input value] [--tty auto|on|off] -- <command> [...args]',
  );
  process.exit(1);
}

function startLogPolling(filePath: string, onChunk: (chunk: string) => Promise<void> | void): {
  flush: () => Promise<void>;
  stop: () => Promise<void>;
} {
  let offset = 0;
  let stopped = false;
  let activeRead: Promise<void> = Promise.resolve();

  const readNewData = async (): Promise<void> => {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size <= offset) {
        return;
      }

      const handle = await fs.open(filePath, 'r');
      try {
        const length = stats.size - offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        offset = stats.size;
        const chunk = buffer.toString('utf8');
        if (chunk.length > 0) {
          await onChunk(chunk);
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (!stopped) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[pingly-run] Failed to read terminal log: ${message}`);
      }
    }
  };

  const tick = (): void => {
    activeRead = activeRead.then(() => readNewData());
  };

  const timer = setInterval(tick, 150);

  return {
    flush: async () => {
      tick();
      await activeRead;
    },
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await activeRead;
    },
  };
}

void main();
