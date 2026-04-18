const test = require('node:test');
const assert = require('node:assert/strict');

const { ResponseDispatcher } = require('../../out/services/ResponseDispatcher');

test('dispatch forwards responses to the configured target', async () => {
  const dispatcher = new ResponseDispatcher();
  const received = [];

  dispatcher.setTarget({
    async send(response) {
      received.push(response);
    },
  });

  const response = {
    eventId: 'evt-1',
    allowed: true,
    respondedAt: Date.now(),
  };

  await dispatcher.dispatch(response);
  assert.deepEqual(received, [response]);
});

test('dispatch is a no-op when no target is configured', async () => {
  const dispatcher = new ResponseDispatcher();

  await assert.doesNotReject(() =>
    dispatcher.dispatch({
      eventId: 'evt-2',
      allowed: false,
      respondedAt: Date.now(),
    }),
  );
});
