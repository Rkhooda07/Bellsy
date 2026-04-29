const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { CodexSessionMonitor, parseCodexSessionLine } = require('../../out/cli/CodexSessionMonitor');
const { AgentEventPriority, AgentEventType } = require('../../out/core/types');

test('parses codex task_complete session events into completion notifications', () => {
  const line = JSON.stringify({
    timestamp: '2026-04-29T08:30:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'task_complete',
      turn_id: 'turn_123',
      last_agent_message: 'Implemented the feature.\n\nMore details here.',
    },
  });

  const event = parseCodexSessionLine(line, 'codex', Date.parse('2026-04-29T08:29:00.000Z'));

  assert.equal(event.type, AgentEventType.TASK_COMPLETED);
  assert.equal(event.priority, AgentEventPriority.LOW);
  assert.equal(event.confidence, 'high');
  assert.equal(event.correlationId, 'codex-turn:turn_123');
  assert.match(event.message, /Implemented the feature/i);
});

test('ignores non-task-complete codex session events', () => {
  const line = JSON.stringify({
    timestamp: '2026-04-29T08:30:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'task_started',
      turn_id: 'turn_123',
    },
  });

  const event = parseCodexSessionLine(line, 'codex', Date.parse('2026-04-29T08:29:00.000Z'));

  assert.equal(event, null);
});

test('parses codex exec_command approval requests into permission notifications', () => {
  const line = JSON.stringify({
    timestamp: '2026-04-29T08:30:00.000Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      call_id: 'call_approval_123',
      arguments: JSON.stringify({
        cmd: 'git init',
        sandbox_permissions: 'require_escalated',
        justification: 'Do you want to initialize a Git repository in this folder?',
      }),
    },
  });

  const event = parseCodexSessionLine(line, 'codex', Date.parse('2026-04-29T08:29:00.000Z'));

  assert.equal(event.type, AgentEventType.PERMISSION_REQUIRED);
  assert.equal(event.priority, AgentEventPriority.HIGH);
  assert.equal(event.confidence, 'high');
  assert.equal(event.correlationId, 'codex-approval:call_approval_123');
  assert.match(event.message, /initialize a Git repository/i);
});

test('ignores stale codex approval requests from before the wrapper started', () => {
  const line = JSON.stringify({
    timestamp: '2026-04-29T08:10:00.000Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      call_id: 'call_old_approval',
      arguments: JSON.stringify({
        cmd: 'git init',
        sandbox_permissions: 'require_escalated',
        justification: 'Do you want to initialize a Git repository in this folder?',
      }),
    },
  });

  const event = parseCodexSessionLine(line, 'codex', Date.parse('2026-04-29T08:29:00.000Z'));

  assert.equal(event, null);
});

test('finds matching codex session files even when session_meta exceeds 8kb', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pingly-codex-monitor-'));
  const startedAt = Date.parse('2026-04-29T09:20:20.000Z');
  const sessionDir = path.join(tempRoot, '2026', '04', '29');
  const sessionFile = path.join(sessionDir, 'rollout-2026-04-29T14-50-28-test.jsonl');
  const oversizedInstructions = 'x'.repeat(16_000);

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    sessionFile,
    `${JSON.stringify({
      timestamp: '2026-04-29T09:20:58.729Z',
      type: 'session_meta',
      payload: {
        id: 'session_123',
        timestamp: '2026-04-29T09:20:28.813Z',
        cwd: '/Users/rkhooda/Desktop/Coding/Projects/Pingly',
        originator: 'codex-tui',
        base_instructions: { text: oversizedInstructions },
      },
    })}\n`,
  );

  try {
    const monitor = new CodexSessionMonitor(
      {
        sessionsRoot: tempRoot,
        cwd: '/Users/rkhooda/Desktop/Coding/Projects/Pingly',
        startedAtMs: startedAt,
        agent: 'codex',
      },
      () => {},
    );

    const activeFile = await monitor.findActiveSessionFile();
    assert.equal(activeFile, sessionFile);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
