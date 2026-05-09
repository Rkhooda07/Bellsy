#!/usr/bin/env node
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as net from 'net';

import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

import { CodexSessionMonitor } from './CodexSessionMonitor';
import { DetectedCliEvent, PatternDetector } from './PatternDetector';
import { StandaloneServer } from './StandaloneServer';

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
const DEFAULT_SERVER_PORT = 9001;
const SERVER_START_TIMEOUT_MS = 5_000;
const GEMINI_HOOK_EXTENSION_NAME = 'bellsy-notifications';
const GEMINI_AFTER_AGENT_HOOK_SCRIPT = `#!/usr/bin/env node
const http = require('node:http');
const https = require('node:https');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  void main();
});

async function main() {
  try {
    const payload = input.trim() ? JSON.parse(input) : {};
    const endpoint = process.env.BELLSY_URL || 'http://127.0.0.1:9001/event';
    const agent = process.env.BELLSY_AGENT || 'gemini';
    await postJson(endpoint, {
      type: 'task_completed',
      source: 'cli',
      priority: 'low',
      agent,
      message: formatMessage(agent, payload.prompt_response),
      correlationId: buildCorrelationId(payload),
      metadata: {
        confidence: 'high',
        wrapper: 'bellsy-run',
        integration: 'gemini-after-agent-hook',
      },
    });
  } catch {
  } finally {
    process.stdout.write('{"suppressOutput":true}\\n');
  }
}

function formatMessage(agent, response) {
  const summary = summarize(response);
  return summary ? agent + ': ' + summary : agent + ': Response completed';
}

function summarize(response) {
  if (typeof response !== 'string') {
    return '';
  }

  const line = response
    .split(/\\r?\\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith(String.fromCharCode(96, 96, 96)));

  if (!line) {
    return '';
  }

  return line.length > 120 ? line.slice(0, 117) + '...' : line;
}

function buildCorrelationId(payload) {
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : process.env.BELLSY_RUN_ID || 'unknown';
  const timestamp = typeof payload.timestamp === 'string' ? payload.timestamp : String(Date.now());
  return 'gemini-after-agent:' + sessionId + ':' + timestamp;
}

function postJson(endpoint, body) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve();
      return;
    }

    const data = Buffer.from(JSON.stringify(body));
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(data.length),
        },
        timeout: 2500,
      },
      (response) => {
        response.resume();
        response.on('end', resolve);
      },
    );

    request.on('error', resolve);
    request.on('timeout', () => {
      request.destroy();
      resolve();
    });
    request.end(data);
  });
}
`;

async function main(): Promise<void> {
  if (process.argv.includes('--serve')) {
    const server = new StandaloneServer(parseServePort(process.argv.slice(2)), path.join(__dirname, '..', '..'));
    await server.start();
    return;
  }

  const options = parseArgs(process.argv.slice(2));

  options.endpoint = await ensureStandaloneServer(options.endpoint);

  const detector = new PatternDetector({ agent: options.agent });
  const plan = buildSpawnPlan(options);
  const runId = randomUUID();
  if (shouldInstallGeminiHook(options)) {
    await ensureGeminiHookExtension();
  }

  if (plan.kind === 'tty-log') {
    await runWithTerminalCapture(plan, detector, options, runId);
    return;
  }

  await runWithPipes(plan, detector, options, runId);
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.once('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.once('error', () => {
      resolve(false);
    });
    client.connect(port, '127.0.0.1');
  });
}

async function ensureStandaloneServer(endpoint: string): Promise<string> {
  const port = endpointPort(endpoint);
  if (!port) {
    return endpoint;
  }

  if (await isBellsyServer(endpoint)) {
    return endpoint;
  }

  const portIsBusy = await checkPort(port);
  const serverPort = portIsBusy ? await findOpenPort() : port;
  const serverEndpoint = endpointWithPort(endpoint, serverPort);

  if (portIsBusy) {
    console.error(
      `[bellsy-run] Port ${port} is already in use by another process. ` +
        `Starting Bellsy on ${serverEndpoint} for this run.`,
    );
  }

  startBackgroundServer(serverPort);

  const started = await waitForBellsyServer(serverEndpoint, SERVER_START_TIMEOUT_MS);
  if (!started) {
    console.error(
      `[bellsy-run] Bellsy notification server did not start on ${serverEndpoint}. ` +
        'The wrapped command will still run, but notifications may not appear.',
    );
    return endpoint;
  }

  return serverEndpoint;
}

function startBackgroundServer(port: number): void {
  const scriptPath = __filename;
  const child = spawn(process.execPath, [scriptPath, '--serve', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BELLSY_BACKGROUND: 'true' },
  });
  child.unref();
}

function childEnv(options: CliOptions, runId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BELLSY_URL: options.endpoint,
    BELLSY_AGENT: options.agent,
    BELLSY_RUN_ID: runId,
  };
}

async function waitForBellsyServer(endpoint: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBellsyServer(endpoint)) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

async function isBellsyServer(endpoint: string): Promise<boolean> {
  const healthEndpoint = healthEndpointFor(endpoint);
  if (!healthEndpoint) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);
  try {
    const response = await fetch(healthEndpoint, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }

    const body = (await response.json().catch(() => null)) as { name?: unknown; status?: unknown } | null;
    return body?.name === 'bellsy' && body.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function healthEndpointFor(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:') {
      return null;
    }

    url.pathname = '/health';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function endpointWithPort(endpoint: string, port: number): string {
  const url = new URL(endpoint);
  url.port = String(port);
  return url.toString();
}

function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function runWithPipes(
  plan: Extract<SpawnPlan, { kind: 'pipe' }>,
  detector: PatternDetector,
  options: CliOptions,
  runId: string,
): Promise<void> {
  const child = spawn(plan.command, plan.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv(options, runId),
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
    console.error(`[bellsy-run] Failed to start ${plan.command}: ${error.message}`);
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
    env: childEnv(options, runId),
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
    console.error(`[bellsy-run] Failed to start ${plan.command}: ${error.message}`);
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
  let agent = process.env.BELLSY_AGENT ?? '';
  let endpoint = process.env.BELLSY_URL ?? DEFAULT_ENDPOINT;
  let allowInput = process.env.BELLSY_ALLOW_INPUT ?? 'y\n';
  let denyInput = process.env.BELLSY_DENY_INPUT ?? 'n\n';
  let ttyMode = (process.env.BELLSY_TTY_MODE as CliOptions['ttyMode'] | undefined) ?? 'auto';
  const commandSeparatorIndex = args.indexOf('--');
  const commandStartIndex = commandSeparatorIndex === -1 ? findCommandStartIndex(args) : commandSeparatorIndex + 1;
  const wrapperArgs = commandSeparatorIndex === -1 ? args.slice(0, commandStartIndex) : args.slice(0, commandSeparatorIndex);
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

  const commandParts = args.slice(commandStartIndex);
  const command = commandParts[0];
  if (!command) {
    printUsageAndExit();
  }

  return {
    agent: agent || inferAgentName(command),
    endpoint,
    allowInput,
    denyInput,
    ttyMode,
    command,
    args: commandParts.slice(1),
  };
}

function parseServePort(args: string[]): number {
  const portIndex = args.indexOf('--port');
  if (portIndex === -1) {
    return DEFAULT_SERVER_PORT;
  }

  const value = Number(args[portIndex + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error('Usage: bellsy-run --serve [--port port]');
    process.exit(1);
  }

  return value;
}

function endpointPort(endpoint: string): number | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:') {
      return null;
    }

    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') {
      return null;
    }

    return url.port ? Number(url.port) : 80;
  } catch {
    return null;
  }
}

function shouldInstallGeminiHook(options: CliOptions): boolean {
  return /^gemini$/i.test(options.agent) || path.basename(options.command).toLowerCase() === 'gemini';
}

async function ensureGeminiHookExtension(): Promise<void> {
  const extensionDir = path.join(os.homedir(), '.gemini', 'extensions', GEMINI_HOOK_EXTENSION_NAME);
  const hooksDir = path.join(extensionDir, 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });

  await writeFileIfChanged(
    path.join(extensionDir, 'gemini-extension.json'),
    `${JSON.stringify(
      {
        name: GEMINI_HOOK_EXTENSION_NAME,
        version: '1.0.0',
        description: 'Bellsy notification bridge for Gemini CLI turns.',
      },
      null,
      2,
    )}\n`,
  );

  await writeFileIfChanged(
    path.join(extensionDir, '.gemini-extension-install.json'),
    `${JSON.stringify({ type: 'local', source: extensionDir }, null, 2)}\n`,
  );

  await writeFileIfChanged(
    path.join(hooksDir, 'hooks.json'),
    `${JSON.stringify(
      {
        hooks: {
          AfterAgent: [
            {
              hooks: [
                {
                  type: 'command',
                  name: 'bellsy-after-agent',
                  command: 'node ${extensionPath}/after-agent.js',
                  timeout: 5_000,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFileIfChanged(path.join(extensionDir, 'after-agent.js'), GEMINI_AFTER_AGENT_HOOK_SCRIPT);
}

async function writeFileIfChanged(filePath: string, content: string): Promise<void> {
  const current = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (current === content) {
    return;
  }

  await fs.writeFile(filePath, content, { mode: 0o644 });
}

function findCommandStartIndex(args: string[]): number {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--agent' || arg === '--endpoint' || arg === '--allow-input' || arg === '--deny-input' || arg === '--tty') {
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      printUsageAndExit();
    }

    return index;
  }

  return args.length;
}

function inferAgentName(command: string): string {
  const baseName = path.basename(command).toLowerCase();
  if (
    baseName === 'codex' ||
    baseName === 'claude' ||
    baseName === 'claude-code' ||
    baseName === 'gemini' ||
    baseName === 'blackbox'
  ) {
    return baseName;
  }

  return baseName || 'unknown';
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
    const logFilePath = path.join(os.tmpdir(), `bellsy-run-${Date.now()}-${Math.random().toString(16).slice(2)}.log`);
    return {
      kind: 'tty-log',
      command: 'script',
      args: buildScriptArgs(logFilePath, options.command, options.args),
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

  const agents = /^(codex|claude|claude-code|gemini|blackbox)$/i;
  return agents.test(options.command) || agents.test(options.agent);
}

function buildScriptArgs(logFilePath: string, command: string, args: string[]): string[] {
  if (os.platform() === 'darwin') {
    return ['-q', '-F', logFilePath, command, ...args];
  }

  return ['-q', '-f', logFilePath, command, ...args];
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
        wrapper: 'bellsy-run',
      },
    }),
  }).catch((error: Error) => {
    console.error(`[bellsy-run] Failed to notify Bellsy: ${error.message}`);
    return null;
  });

  if (!response) {
    return null;
  }

  if (!response.ok) {
    console.error(`[bellsy-run] Notification failed: HTTP ${response.status}`);
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
    'Usage: bellsy-run [--agent name] [--endpoint url] [--allow-input value] [--deny-input value] [--tty auto|on|off] [--] <command> [...args]',
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
        console.error(`[bellsy-run] Failed to read terminal log: ${message}`);
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
