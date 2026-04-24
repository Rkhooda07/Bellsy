const test = require('node:test');
const assert = require('node:assert/strict');

const { parseEvent } = require('../../out/core/EventValidator');
const { AgentEventPriority, AgentEventSource, AgentEventType } = require('../../out/core/types');

test('parseEvent accepts valid payloads and fills defaults', () => {
  const event = parseEvent({
    type: AgentEventType.PERMISSION_REQUIRED,
    message: 'Run npm install',
  });

  assert.equal(event.type, AgentEventType.PERMISSION_REQUIRED);
  assert.equal(event.source, AgentEventSource.EXTERNAL_AGENT);
  assert.equal(event.message, 'Run npm install');
  assert.equal(event.priority, AgentEventPriority.HIGH);
  assert.equal(typeof event.id, 'string');
  assert.equal(typeof event.timestamp, 'number');
  assert.deepEqual(event.metadata, {});
});

test('parseEvent accepts explicit normalized source fields', () => {
  const event = parseEvent({
    type: AgentEventType.TASK_COMPLETED,
    source: AgentEventSource.CLI,
    priority: AgentEventPriority.LOW,
    message: 'Task finished',
    agent: 'claude',
    workspace: '/tmp/project',
    correlationId: 'run-123',
  });

  assert.equal(event.source, AgentEventSource.CLI);
  assert.equal(event.priority, AgentEventPriority.LOW);
  assert.equal(event.agent, 'claude');
  assert.equal(event.workspace, '/tmp/project');
  assert.equal(event.correlationId, 'run-123');
});

test('parseEvent applies transport defaults when source is omitted', () => {
  const event = parseEvent(
    {
      type: AgentEventType.TASK_COMPLETED,
      message: 'Task finished',
    },
    { source: AgentEventSource.HTTP },
  );

  assert.equal(event.source, AgentEventSource.HTTP);
  assert.equal(event.priority, AgentEventPriority.LOW);
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

test('parseEvent rejects invalid source and priority values', () => {
  assert.throws(
    () =>
      parseEvent({
        type: AgentEventType.TASK_COMPLETED,
        source: 'terminal',
        message: 'Done',
      }),
    /Unknown event source/,
  );

  assert.throws(
    () =>
      parseEvent({
        type: AgentEventType.TASK_COMPLETED,
        priority: 'urgent',
        message: 'Done',
      }),
    /Unknown event priority/,
  );
});
