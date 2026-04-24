const test = require('node:test');
const assert = require('node:assert/strict');

const { EventRouter } = require('../../out/core/EventRouter');
const { AgentEventPriority, AgentEventSource, AgentEventType } = require('../../out/core/types');

function createEvent(overrides = {}) {
  return {
    id: 'evt-1',
    type: AgentEventType.TASK_COMPLETED,
    source: AgentEventSource.CLI,
    message: 'Task finished',
    priority: AgentEventPriority.LOW,
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  };
}

test('routes new events and drops duplicates by correlation id', () => {
  let time = 10_000;
  const router = new EventRouter({ rateLimitWindowMs: 0, now: () => time });

  assert.equal(router.shouldRoute(createEvent({ id: 'evt-1', correlationId: 'run-1' })), true);
  time += 100;
  assert.equal(router.shouldRoute(createEvent({ id: 'evt-2', correlationId: 'run-1' })), false);
});

test('drops burst events from the same source type and agent', () => {
  let time = 10_000;
  const router = new EventRouter({ rateLimitWindowMs: 750, now: () => time });

  assert.equal(router.shouldRoute(createEvent({ id: 'evt-1', message: 'Done 1', agent: 'claude' })), true);
  time += 100;
  assert.equal(router.shouldRoute(createEvent({ id: 'evt-2', message: 'Done 2', agent: 'claude' })), false);
  time += 750;
  assert.equal(router.shouldRoute(createEvent({ id: 'evt-3', message: 'Done 3', agent: 'claude' })), true);
});

test('allows the same signal after the dedupe window expires', () => {
  let time = 10_000;
  const router = new EventRouter({ dedupeWindowMs: 500, rateLimitWindowMs: 0, now: () => time });
  const event = createEvent({ id: 'evt-1', message: 'Same output' });

  assert.equal(router.shouldRoute(event), true);
  time += 100;
  assert.equal(router.shouldRoute(createEvent({ id: 'evt-2', message: 'Same output' })), false);
  time += 600;
  assert.equal(router.shouldRoute(createEvent({ id: 'evt-3', message: 'Same output' })), true);
});
