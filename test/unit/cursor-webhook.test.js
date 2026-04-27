const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { parseCursorWebhook } = require('../../out/integrations/CursorWebhook');
const { AgentEventPriority, AgentEventSource, AgentEventType } = require('../../out/core/types');

function sign(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

test('cursor finished webhook maps to task completed event', () => {
  const body = JSON.stringify({
    event: 'statusChange',
    timestamp: '2024-01-15T10:30:00Z',
    id: 'bc_123',
    status: 'FINISHED',
    summary: 'Added README.md with installation instructions',
    source: {
      repository: 'https://github.com/example/repo',
      ref: 'main',
    },
    target: {
      url: 'https://cursor.com/agents?id=bc_123',
      branchName: 'cursor/add-readme-1234',
    },
  });

  const event = parseCursorWebhook(body, {
    event: 'statusChange',
    deliveryId: 'delivery-1',
    userAgent: 'Cursor-Agent-Webhook/1.0',
  });

  assert.equal(event.type, AgentEventType.TASK_COMPLETED);
  assert.equal(event.source, AgentEventSource.EXTERNAL_AGENT);
  assert.equal(event.agent, 'cursor-background');
  assert.equal(event.priority, AgentEventPriority.LOW);
  assert.equal(event.message, 'Added README.md with installation instructions');
  assert.equal(event.correlationId, 'cursor-background:bc_123:FINISHED');
});

test('cursor error webhook maps to attention-required event', () => {
  const body = JSON.stringify({
    event: 'statusChange',
    id: 'bc_456',
    status: 'ERROR',
  });

  const event = parseCursorWebhook(body, {
    event: 'statusChange',
    deliveryId: 'delivery-2',
  });

  assert.equal(event.type, AgentEventType.ATTENTION_REQUIRED);
  assert.equal(event.priority, AgentEventPriority.HIGH);
  assert.match(event.message, /needs attention/i);
});

test('cursor webhook verifies signatures when a secret is configured', () => {
  const secret = '12345678901234567890123456789012';
  const body = JSON.stringify({
    event: 'statusChange',
    id: 'bc_789',
    status: 'FINISHED',
  });

  const event = parseCursorWebhook(
    body,
    {
      event: 'statusChange',
      signature: sign(secret, body),
    },
    secret,
  );

  assert.equal(event.type, AgentEventType.TASK_COMPLETED);
});

test('cursor webhook rejects an invalid signature', () => {
  const secret = '12345678901234567890123456789012';
  const body = JSON.stringify({
    event: 'statusChange',
    id: 'bc_789',
    status: 'FINISHED',
  });

  assert.throws(
    () =>
      parseCursorWebhook(
        body,
        {
          event: 'statusChange',
          signature: 'sha256=bad',
        },
        secret,
      ),
    /signature verification failed/i,
  );
});
