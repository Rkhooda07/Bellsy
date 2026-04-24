const test = require('node:test');
const assert = require('node:assert/strict');

const { PatternDetector } = require('../../out/cli/PatternDetector');
const { AgentEventPriority, AgentEventType } = require('../../out/core/types');

test('detects permission prompts from streaming output', () => {
  const detector = new PatternDetector({ agent: 'claude' });

  const events = detector.ingest('Tool wants to run npm install. Do you want to proceed? [y/N]');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.PERMISSION_REQUIRED);
  assert.equal(events[0].priority, AgentEventPriority.HIGH);
  assert.match(events[0].message, /claude/);
});

test('detects completion phrases from recent output lines', () => {
  const detector = new PatternDetector({ agent: 'codex' });

  const events = detector.ingest('Applying patch\nDone\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
  assert.equal(events[0].priority, AgentEventPriority.LOW);
});

test('emits process completion on successful exit', () => {
  const detector = new PatternDetector({ agent: 'copilot' });

  const events = detector.onExit(0);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
});

test('dedupes repeated signals within the cooldown window', () => {
  let time = 10_000;
  const detector = new PatternDetector({
    cooldownMs: 5_000,
    now: () => time,
  });

  assert.equal(detector.ingest('Waiting for confirmation [y/N]').length, 1);
  time += 100;
  assert.equal(detector.ingest('Waiting for confirmation [y/N]').length, 0);
  time += 5_000;
  assert.equal(detector.ingest('Waiting for confirmation [y/N]').length, 1);
});
