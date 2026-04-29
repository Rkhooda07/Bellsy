const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCodexSessionLine } = require('../../out/cli/CodexSessionMonitor');
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
