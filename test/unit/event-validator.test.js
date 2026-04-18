const test = require('node:test');
const assert = require('node:assert/strict');

const { parseEvent } = require('../../out/core/EventValidator');
const { AgentEventType } = require('../../out/core/types');

test('parseEvent accepts valid payloads and fills defaults', () => {
  const event = parseEvent({
    type: AgentEventType.PERMISSION_REQUIRED,
    message: 'Run npm install',
  });

  assert.equal(event.type, AgentEventType.PERMISSION_REQUIRED);
  assert.equal(event.message, 'Run npm install');
  assert.equal(typeof event.id, 'string');
  assert.equal(typeof event.timestamp, 'number');
  assert.deepEqual(event.metadata, {});
});

test('parseEvent rejects invalid event types', () => {
  assert.throws(
    () =>
      parseEvent({
        type: 'unknown_event',
        message: 'Bad payload',
      }),
    /Unknown event type/,
  );
});

test('parseEvent rejects blank messages', () => {
  assert.throws(
    () =>
      parseEvent({
        type: AgentEventType.TASK_COMPLETED,
        message: '   ',
      }),
    /non-empty string/,
  );
});
