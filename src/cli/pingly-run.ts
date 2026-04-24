#!/usr/bin/env node
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

import { DetectedCliEvent, PatternDetector } from './PatternDetector';

type CliOptions = {
  agent: string;
  endpoint: string;
  allowInput: string;
  denyInput: string;
  command: string;
  args: string[];
};

const DEFAULT_ENDPOINT = 'http://127.0.0.1:9001/event';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const detector = new PatternDetector({ agent: options.agent });
  const child = spawn(options.command, options.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  const runId = randomUUID();

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    void handleDetectedEvents(detector.ingest(chunk.toString('utf8')), options, runId, child.stdin);
  });

  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    void handleDetectedEvents(detector.ingest(chunk.toString('utf8')), options, runId, child.stdin);
  });

  child.on('error', (error) => {
    console.error(`[pingly-run] Failed to start ${options.command}: ${error.message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    void handleDetectedEvents(detector.onExit(code), options, runId, child.stdin).finally(() => {
      process.exit(code ?? 1);
    });
  });
}

function parseArgs(args: string[]): CliOptions {
  let agent = process.env.PINGLY_AGENT ?? 'unknown';
  let endpoint = process.env.PINGLY_URL ?? DEFAULT_ENDPOINT;
  let allowInput = process.env.PINGLY_ALLOW_INPUT ?? 'y\n';
  let denyInput = process.env.PINGLY_DENY_INPUT ?? 'n\n';
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
    command,
    args: commandParts.slice(1),
  };
}

async function handleDetectedEvents(
  events: DetectedCliEvent[],
  options: CliOptions,
  runId: string,
  stdin: NodeJS.WritableStream,
): Promise<void> {
  for (const event of events) {
    const response = await postEvent(event, options, runId);
    if (event.type === AgentEventType.PERMISSION_REQUIRED && response && typeof response.allowed === 'boolean') {
      stdin.write(response.allowed ? options.allowInput : options.denyInput);
    }
  }
}

async function postEvent(
  event: DetectedCliEvent,
  options: CliOptions,
  runId: string,
): Promise<{ allowed?: boolean } | null> {
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
      correlationId: runId,
      metadata: {
        confidence: event.confidence,
        wrapper: 'pingly-run',
      },
    }),
  }).catch((error: Error) => {
    console.error(`[pingly-run] Failed to notify AI Agent Notifier: ${error.message}`);
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

function decodeInput(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function printUsageAndExit(): never {
  console.error(
    'Usage: pingly-run [--agent name] [--endpoint url] [--allow-input value] [--deny-input value] -- <command> [...args]',
  );
  process.exit(1);
}

void main();
