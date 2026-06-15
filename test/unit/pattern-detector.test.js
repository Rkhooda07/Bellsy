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

  detector.ingest('Thinking...\n');
  const events = detector.ingest('Applying patch\nDone\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
  assert.equal(events[0].priority, AgentEventPriority.LOW);
});

test('emits process completion on successful exit', () => {
  const detector = new PatternDetector({ agent: 'copilot' });

  detector.ingest('Applying changes...\n');
  const events = detector.onExit(0);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
});

test('does not emit duplicate process completion after detected completion', () => {
  const detector = new PatternDetector({ agent: 'gemini', cooldownMs: 1 });

  assert.equal(detector.ingest('Generating response...\nDone.\n').length, 1);
  assert.equal(detector.onExit(0).length, 0);
});

test('emits attention-required on non-zero exit', () => {
  const detector = new PatternDetector({ agent: 'codex' });

  const events = detector.onExit(2);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.ATTENTION_REQUIRED);
  assert.equal(events[0].priority, AgentEventPriority.HIGH);
  assert.match(events[0].message, /exited with code 2/i);
});

test('detects failure phrases from recent output lines', () => {
  const detector = new PatternDetector({ agent: 'claude-code' });

  const events = detector.ingest('Applying patch\nError: tests failed\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.ATTENTION_REQUIRED);
  assert.equal(events[0].priority, AgentEventPriority.HIGH);
});

test('detects Gemini finished generating', () => {
  const detector = new PatternDetector({ agent: 'gemini' });

  const events = detector.ingest('Generating response...\nFinished generating\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
  assert.match(events[0].message, /gemini/);
});

test('detects Gemini completion before the prompt redraws', () => {
  const detector = new PatternDetector({ agent: 'gemini' });

  const events = detector.ingest('Generating response...\nThe code has been updated.\nDone.\n> ');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
  assert.match(events[0].message, /gemini/);
});

test('detects Gemini TUI prompt return after assistant activity', () => {
  const detector = new PatternDetector({ agent: 'gemini' });

  assert.equal(detector.ingest('✦ I updated the implementation.\n').length, 0);
  const events = detector.ingest('\r│ > ');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
});

test('does not treat an initial Gemini prompt as completion', () => {
  const detector = new PatternDetector({ agent: 'gemini' });

  const events = detector.ingest('│ > ');

  assert.equal(events.length, 0);
});

test('detects Claude Code TUI prompt return after assistant activity', () => {
  const detector = new PatternDetector({ agent: 'claude-code' });

  assert.equal(detector.ingest('⏺ Updated the failing tests.\n').length, 0);
  const events = detector.ingest('\n> ');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.TASK_COMPLETED);
});

test('detects Blackbox needs approval', () => {
  const detector = new PatternDetector({ agent: 'blackbox' });

  const events = detector.ingest('Blackbox > Action required: allow shell script?');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, AgentEventType.PERMISSION_REQUIRED);
  assert.match(events[0].message, /blackbox/);
});

test('detects Blackbox prompt return after assistant activity', () => {
  const detector = new PatternDetector({ agent: 'blackbox' });

  assert.equal(detector.ingest('Blackbox: Created the files.\n').length, 0);
  const events = detector.ingest('\n> ');

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

test('clearing buffer prevents loops when same text is re-ingested after cooldown', () => {
  let time = 10_000;
  const detector = new PatternDetector({
    agent: 'gemini',
    cooldownMs: 5_000,
    now: () => time,
  });

  // First detection
  assert.equal(detector.ingest('gemini: Thinking...\nDone.\n').length, 1);
  
  // Wait for cooldown
  time += 6_000;
  
  // Ingest empty chunk - should NOT re-emit because buffer was cleared
  assert.equal(detector.ingest('').length, 0);
  
  // Even if we ingest a newline
  assert.equal(detector.ingest('\n').length, 0);
});
