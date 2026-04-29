const test = require('node:test');
const assert = require('node:assert/strict');

const { NotificationEngine } = require('../../out/services/NotificationEngine');
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

function createHarness(focused) {
  const calls = [];
  const engine = new NotificationEngine(
    {
      async showPermissionRequest(message) {
        calls.push(['popup-permission', message]);
        return 'Allow';
      },
      showTaskCompleted(message) {
        calls.push(['popup-complete', message]);
        return Promise.resolve(undefined);
      },
      showAttentionRequired(message) {
        calls.push(['popup-attention', message]);
        return Promise.resolve(undefined);
      },
    },
    {
      usesNativeSound() {
        return false;
      },
      async showPermissionRequest(message, critical) {
        calls.push(['system-permission', message, critical]);
        return undefined;
      },
      notifyCompletion(message, critical) {
        calls.push(['system-complete', message, critical]);
      },
      notifyAttention(message, critical) {
        calls.push(['system-attention', message, critical]);
      },
    },
    {
      playPermissionAlert() {
        calls.push(['sound-permission']);
      },
      playTaskComplete() {
        calls.push(['sound-complete']);
      },
    },
    {
      info() {},
      show() {
        calls.push(['show-logs']);
      },
    },
    () => focused,
    () => {
      calls.push(['show-logs']);
    },
  );

  return { calls, engine };
}

test('completion notifications always use prominent system delivery', () => {
  const { calls, engine } = createHarness(true);

  engine.showTaskCompleted(createEvent());

  assert.deepEqual(calls, [
    ['popup-complete', 'Task finished'],
    ['system-complete', 'Task finished', true],
    ['sound-complete'],
  ]);
});

test('high-priority permission notifications are critical even when focused', async () => {
  const { calls, engine } = createHarness(true);

  const choice = await engine.requestPermission(
    createEvent({
      type: AgentEventType.PERMISSION_REQUIRED,
      message: 'Run npm install',
      priority: AgentEventPriority.HIGH,
    }),
  );

  assert.equal(choice, 'Allow');
  assert.deepEqual(calls, [
    ['popup-permission', 'Run npm install'],
    ['system-permission', 'Run npm install', true],
    ['sound-permission'],
  ]);
});

test('low-priority completion notifications still use prominent system delivery', () => {
  const { calls, engine } = createHarness(true);

  engine.showTaskCompleted(
    createEvent({
      type: AgentEventType.TASK_COMPLETED,
      priority: AgentEventPriority.LOW,
      message: 'HTTP completion test',
    }),
  );

  assert.deepEqual(calls, [
    ['popup-complete', 'HTTP completion test'],
    ['system-complete', 'HTTP completion test', true],
    ['sound-complete'],
  ]);
});

test('completion notifications still show the popup surface before system delivery', () => {
  const { calls, engine } = createHarness(true);

  engine.showTaskCompleted(createEvent({ message: 'Popup surface test' }));

  assert.deepEqual(calls[0], ['popup-complete', 'Popup surface test']);
  assert.equal(calls[1][0], 'system-complete');
});

test('attention notifications use the stronger popup and sound path', () => {
  const { calls, engine } = createHarness(true);

  engine.showAttentionRequired(
    createEvent({
      type: AgentEventType.ATTENTION_REQUIRED,
      priority: AgentEventPriority.HIGH,
      message: 'Cursor background agent needs attention',
    }),
  );

  assert.deepEqual(calls, [
    ['popup-attention', 'Cursor background agent needs attention'],
    ['system-attention', 'Cursor background agent needs attention', true],
    ['sound-permission'],
  ]);
});

test('open logs action from completion popup shows the output channel', async () => {
  const calls = [];
  const engine = new NotificationEngine(
    {
      async showPermissionRequest() {
        return 'Allow';
      },
      showTaskCompleted(message) {
        calls.push(['popup-complete', message]);
        return Promise.resolve('Open Logs');
      },
      showAttentionRequired() {
        return Promise.resolve(undefined);
      },
    },
    {
      usesNativeSound() {
        return false;
      },
      async showPermissionRequest() {
        return undefined;
      },
      notifyCompletion(message, critical) {
        calls.push(['system-complete', message, critical]);
      },
      notifyAttention() {},
    },
    {
      playPermissionAlert() {},
      playTaskComplete() {
        calls.push(['sound-complete']);
      },
    },
    {
      info() {},
      show() {},
    },
    () => true,
    () => {
      calls.push(['show-logs']);
    },
  );

  engine.showTaskCompleted(createEvent({ message: 'Needs follow-up' }));
  await Promise.resolve();

  assert.deepEqual(calls, [
    ['popup-complete', 'Needs follow-up'],
    ['system-complete', 'Needs follow-up', true],
    ['sound-complete'],
    ['show-logs'],
  ]);
});

test('agent name is not prefixed twice when the message already includes it', () => {
  const { calls, engine } = createHarness(true);

  engine.showTaskCompleted(
    createEvent({
      agent: 'codex',
      message: 'codex: Finished the turn',
    }),
  );

  assert.deepEqual(calls, [
    ['popup-complete', 'codex: Finished the turn'],
    ['system-complete', 'codex: Finished the turn', true],
    ['sound-complete'],
  ]);
});
