const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { HttpTransport } = require('../../out/transport/HttpTransport');

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function createRequest(body, method = 'POST', url = '/event') {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;

  queueMicrotask(() => {
    req.emit('data', Buffer.from(body));
    req.emit('end');
  });

  return req;
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test('http transport returns permission responses to the caller', async () => {
  const transport = new HttpTransport(9001, 500, createLogger());
  transport.onEvent((event) => {
    void transport.send({
      eventId: event.id,
      allowed: true,
      respondedAt: Date.now(),
    });
  });

  const req = createRequest(
    JSON.stringify({
      type: 'permission_required',
      message: 'Allow install',
    }),
  );
  const res = createResponse();

  await transport.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.status, 'responded');
  assert.equal(body.allowed, true);
  assert.equal(typeof body.eventId, 'string');
});

test('http transport returns 400 for invalid payloads', async () => {
  const transport = new HttpTransport(9001, 500, createLogger());
  const req = createRequest(
    JSON.stringify({
      type: 'unknown_event',
      message: 'bad',
    }),
  );
  const res = createResponse();

  await transport.handleRequest(req, res);

  assert.equal(res.statusCode, 400);
});

test('http transport returns 504 when permission requests time out', async () => {
  const transport = new HttpTransport(9001, 10, createLogger());
  transport.onEvent(() => {});

  const req = createRequest(
    JSON.stringify({
      type: 'permission_required',
      message: 'Need approval',
    }),
  );
  const res = createResponse();

  await transport.handleRequest(req, res);

  assert.equal(res.statusCode, 504);
});
