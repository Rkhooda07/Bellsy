const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { FileWatchTransport } = require('../../out/transport/FileWatchTransport');

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}

test('file transport emits requests and writes responses', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bellsy-test-'));
  const requestFile = path.join(tempDir, 'event.json');
  const responseFile = path.join(tempDir, 'response.json');
  const transport = new FileWatchTransport(requestFile, responseFile, createLogger());
  const received = [];

  transport.onEvent((event) => {
    received.push(event);
  });

  await transport.start();

  try {
    await fs.writeFile(
      requestFile,
      JSON.stringify({
        type: 'task_completed',
        message: 'Patch applied',
      }),
      'utf8',
    );

    await waitFor(() => received.length === 1);
    assert.equal(received[0].message, 'Patch applied');

    const response = {
      eventId: received[0].id,
      allowed: true,
      respondedAt: Date.now(),
    };

    await transport.send(response);

    const written = await waitFor(async () => {
      const raw = await fs.readFile(responseFile, 'utf8');
      return raw.includes(response.eventId) ? raw : '';
    });

    assert.match(written, /"allowed": true/);
  } finally {
    await transport.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
