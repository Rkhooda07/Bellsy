const QUEUE_LIMIT = 20;
const QUEUE_TTL_MS = 15 * 60 * 1000;
const DEDUPE_TTL_MS = 15 * 60 * 1000;

export interface Env {
  RELAY_INSTALLS: DurableObjectNamespace;
  RELAY_MASTER_SECRET: string;
}

type RegisterRecord = {
  installId: string;
  deviceTokenHash: string;
  cursorSecretSalt: string;
  cursorSecretVersion: number;
  cursorWebhookSecretHash: string;
  createdAt: number;
  lastSeenAt: number;
  queuedEvents: QueuedEvent[];
};

type QueuedEvent = {
  event: NormalizedEvent;
  expiresAt: number;
};

type NormalizedEvent = {
  id: string;
  type: 'task_completed' | 'attention_required';
  message: string;
  source: 'external_agent';
  agent: 'cursor-background';
  priority: 'low' | 'high';
  timestamp: number;
  correlationId: string;
  metadata: {
    cursor: {
      deliveryId?: string;
      event: 'statusChange';
      status: 'FINISHED' | 'ERROR';
      url?: string;
      branchName?: string;
      prUrl?: string;
      repository?: string;
      ref?: string;
      userAgent?: string;
    };
  };
};

type RegisterResponse = {
  installId: string;
  deviceToken: string;
  publicWebhookUrl: string;
  cursorWebhookSecret: string;
  relayWebSocketUrl: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/v1/installs/register') {
      return handleRegister(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/installs/restore') {
      return handleRestore(request, env);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/v1/connect/')) {
      const installId = url.pathname.split('/').pop();
      if (!installId) {
        return json({ error: 'installId is required' }, 400);
      }
      const stub = env.RELAY_INSTALLS.get(env.RELAY_INSTALLS.idFromName(installId));
      return stub.fetch(rewriteUrl(request, `/internal/connect/${installId}`));
    }

    if (request.method === 'POST' && url.pathname.startsWith('/v1/webhooks/cursor/')) {
      const installId = url.pathname.split('/').pop();
      if (!installId) {
        return json({ error: 'installId is required' }, 400);
      }
      const stub = env.RELAY_INSTALLS.get(env.RELAY_INSTALLS.idFromName(installId));
      return stub.fetch(rewriteUrl(request, `/internal/webhooks/cursor/${installId}`));
    }

    if (request.method === 'POST' && /^\/v1\/installs\/[^/]+\/rotate-secret$/.test(url.pathname)) {
      const installId = url.pathname.split('/')[3];
      const stub = env.RELAY_INSTALLS.get(env.RELAY_INSTALLS.idFromName(installId));
      const rotation = await stub.fetch(rewriteUrl(request, `/internal/installs/${installId}/rotate-secret`));

      if (!rotation.ok) {
        return rotation;
      }

      const body = (await rotation.json()) as { installId: string; cursorSecretSalt: string; cursorSecretVersion: number };
      return json(
        await createRegisterResponse(
          request,
          env,
          body.installId,
          readBearerToken(request) ?? '',
          body.cursorSecretSalt,
          body.cursorSecretVersion,
        ),
      );
    }

    return json({ error: 'Not found' }, 404);
  },
};

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const installId = crypto.randomUUID();
  const deviceToken = randomToken(32);
  const cursorSecretSalt = randomToken(12);
  const cursorSecretVersion = 1;
  const cursorWebhookSecret = await deriveCursorWebhookSecret(env.RELAY_MASTER_SECRET, installId, cursorSecretSalt, cursorSecretVersion);
  const record: RegisterRecord = {
    installId,
    deviceTokenHash: await sha256(deviceToken),
    cursorSecretSalt,
    cursorSecretVersion,
    cursorWebhookSecretHash: await sha256(cursorWebhookSecret),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    queuedEvents: [],
  };

  const stub = env.RELAY_INSTALLS.get(env.RELAY_INSTALLS.idFromName(installId));
  await stub.fetch('https://relay/internal/register', {
    method: 'POST',
    body: JSON.stringify(record),
  });

  return json(await createRegisterResponse(request, env, installId, deviceToken, cursorSecretSalt, cursorSecretVersion));
}

async function handleRestore(request: Request, env: Env): Promise<Response> {
  const payload = (await request.json()) as { installId?: string; deviceToken?: string };
  if (!payload.installId || !payload.deviceToken) {
    return json({ error: 'installId and deviceToken are required' }, 400);
  }

  const stub = env.RELAY_INSTALLS.get(env.RELAY_INSTALLS.idFromName(payload.installId));
  const response = await stub.fetch('https://relay/internal/restore', {
    method: 'POST',
    body: JSON.stringify({ deviceToken: payload.deviceToken }),
  });

  if (!response.ok) {
    return response;
  }

  const record = (await response.json()) as RegisterRecord;
  return json(
    await createRegisterResponse(
      request,
      env,
      record.installId,
      payload.deviceToken,
      record.cursorSecretSalt,
      record.cursorSecretVersion,
    ),
  );
}

async function createRegisterResponse(
  request: Request,
  env: Env,
  installId: string,
  deviceToken: string,
  cursorSecretSalt: string,
  cursorSecretVersion: number,
): Promise<RegisterResponse> {
  const url = new URL(request.url);
  const publicWebhookUrl = new URL(`/v1/webhooks/cursor/${installId}`, url.origin).toString();
  const socketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const relayWebSocketUrl = `${socketProtocol}//${url.host}/v1/connect/${installId}`;

  return {
    installId,
    deviceToken,
    publicWebhookUrl,
    cursorWebhookSecret: await deriveCursorWebhookSecret(
      env.RELAY_MASTER_SECRET,
      installId,
      cursorSecretSalt,
      cursorSecretVersion,
    ),
    relayWebSocketUrl,
  };
}

function rewriteUrl(request: Request, pathname: string): Request {
  const original = new URL(request.url);
  const rewritten = new URL(pathname, original.origin);
  return new Request(rewritten.toString(), request);
}

export class RelayInstallDurableObject {
  private activeSocket?: WebSocket;
  private recentDeliveryIds = new Map<string, number>();
  private recentCorrelationIds = new Map<string, number>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/register') {
      const record = (await request.json()) as RegisterRecord;
      await this.state.storage.put('record', record);
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/internal/restore') {
      const record = await this.requireRecord();
      const payload = (await request.json()) as { deviceToken?: string };
      if (!payload.deviceToken || (await sha256(payload.deviceToken)) !== record.deviceTokenHash) {
        return json({ error: 'Invalid device token' }, 401);
      }

      record.lastSeenAt = Date.now();
      await this.state.storage.put('record', record);
      return json(record);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/internal/connect/')) {
      return this.handleConnect(request);
    }

    if (request.method === 'POST' && url.pathname.startsWith('/internal/webhooks/cursor/')) {
      return this.handleCursorWebhook(request);
    }

    if (request.method === 'POST' && url.pathname.startsWith('/internal/installs/') && url.pathname.endsWith('/rotate-secret')) {
      return this.handleRotateSecret(request);
    }

    return json({ error: 'Not found' }, 404);
  }

  private async handleConnect(request: Request): Promise<Response> {
    const record = await this.requireRecord();
    const token = readBearerToken(request);
    if (!token || (await sha256(token)) !== record.deviceTokenHash) {
      return json({ error: 'Invalid device token' }, 401);
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'Expected websocket upgrade' }, 426);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    if (this.activeSocket) {
      try {
        this.activeSocket.close(1000, 'Replaced by newer connection');
      } catch {
        // Ignore close errors while replacing a stale connection.
      }
    }

    this.activeSocket = server;
    server.addEventListener('message', (event) => {
      void this.handleSocketMessage(event);
    });
    server.addEventListener('close', () => {
      if (this.activeSocket === server) {
        this.activeSocket = undefined;
      }
    });

    record.lastSeenAt = Date.now();
    await this.flushQueue(record);
    await this.state.storage.put('record', record);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleCursorWebhook(request: Request): Promise<Response> {
    const record = await this.requireRecord();
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const deliveryId = request.headers.get('x-webhook-id') ?? undefined;
    const signature = request.headers.get('x-webhook-signature') ?? '';
    const webhookEvent = String(payload.event ?? request.headers.get('x-webhook-event') ?? '');
    const status = String(payload.status ?? '').toUpperCase();

    if (webhookEvent !== 'statusChange') {
      return json({ status: 'ignored' }, 202);
    }

    if (status !== 'FINISHED' && status !== 'ERROR') {
      return json({ status: 'ignored' }, 202);
    }

    const secret = await deriveCursorWebhookSecret(
      this.env.RELAY_MASTER_SECRET,
      record.installId,
      record.cursorSecretSalt,
      record.cursorSecretVersion,
    );
    const expectedSignature = await hmacSha256(secret, rawBody);
    if (signature !== `sha256=${expectedSignature}`) {
      return json({ error: 'Invalid webhook signature' }, 401);
    }

    const normalized = normalizeCursorEvent(payload, {
      deliveryId,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    if (!normalized) {
      return json({ status: 'ignored' }, 202);
    }

    this.pruneRecentEntries();
    if (
      (deliveryId && this.recentDeliveryIds.has(deliveryId)) ||
      this.recentCorrelationIds.has(normalized.correlationId)
    ) {
      return json({ status: 'duplicate' }, 202);
    }

    if (deliveryId) {
      this.recentDeliveryIds.set(deliveryId, Date.now());
    }
    this.recentCorrelationIds.set(normalized.correlationId, Date.now());
    console.log(JSON.stringify({ installId: record.installId, deliveryId, status }));

    const delivered = this.sendToActiveSocket(normalized);
    record.lastSeenAt = Date.now();

    if (!delivered) {
      const expiresAt = Date.now() + QUEUE_TTL_MS;
      record.queuedEvents = record.queuedEvents
        .filter((entry) => entry.expiresAt > Date.now())
        .slice(-(QUEUE_LIMIT - 1));
      record.queuedEvents.push({ event: normalized, expiresAt });
    }

    await this.state.storage.put('record', record);
    return json({ status: delivered ? 'accepted' : 'queued', id: normalized.id }, 202);
  }

  private async handleRotateSecret(request: Request): Promise<Response> {
    const record = await this.requireRecord();
    const token = readBearerToken(request);
    if (!token || (await sha256(token)) !== record.deviceTokenHash) {
      return json({ error: 'Invalid device token' }, 401);
    }

    record.cursorSecretSalt = randomToken(12);
    record.cursorSecretVersion += 1;
    const secret = await deriveCursorWebhookSecret(
      this.env.RELAY_MASTER_SECRET,
      record.installId,
      record.cursorSecretSalt,
      record.cursorSecretVersion,
    );
    record.cursorWebhookSecretHash = await sha256(secret);
    record.lastSeenAt = Date.now();
    await this.state.storage.put('record', record);

    return json({
      installId: record.installId,
      cursorSecretSalt: record.cursorSecretSalt,
      cursorSecretVersion: record.cursorSecretVersion,
    });
  }

  private async handleSocketMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data !== 'string') {
      return;
    }

    const payload = JSON.parse(event.data) as { type?: string; timestamp?: number };
    if (payload.type === 'ping' && this.activeSocket) {
      this.activeSocket.send(JSON.stringify({ type: 'pong', timestamp: payload.timestamp ?? Date.now() }));
    }
  }

  private sendToActiveSocket(event: NormalizedEvent): boolean {
    if (!this.activeSocket) {
      return false;
    }

    try {
      this.activeSocket.send(JSON.stringify({ type: 'event', event }));
      return true;
    } catch {
      this.activeSocket = undefined;
      return false;
    }
  }

  private async flushQueue(record: RegisterRecord): Promise<void> {
    const now = Date.now();
    const pending = record.queuedEvents.filter((entry) => entry.expiresAt > now);
    record.queuedEvents = [];

    for (const entry of pending) {
      if (!this.sendToActiveSocket(entry.event)) {
        record.queuedEvents.push(entry);
        break;
      }
    }
  }

  private async requireRecord(): Promise<RegisterRecord> {
    const record = await this.state.storage.get<RegisterRecord>('record');
    if (!record) {
      throw new Error('Install record not found');
    }

    return record;
  }

  private pruneRecentEntries(): void {
    const cutoff = Date.now() - DEDUPE_TTL_MS;

    for (const [key, timestamp] of this.recentDeliveryIds) {
      if (timestamp < cutoff) {
        this.recentDeliveryIds.delete(key);
      }
    }

    for (const [key, timestamp] of this.recentCorrelationIds) {
      if (timestamp < cutoff) {
        this.recentCorrelationIds.delete(key);
      }
    }
  }
}

function normalizeCursorEvent(
  payload: Record<string, unknown>,
  headers: { deliveryId?: string; userAgent?: string },
): NormalizedEvent | null {
  const status = String(payload.status ?? '').toUpperCase();
  if (status !== 'FINISHED' && status !== 'ERROR') {
    return null;
  }

  const id = typeof payload.id === 'string' ? payload.id : crypto.randomUUID();
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  const message =
    summary ||
    (status === 'FINISHED'
      ? `Cursor background agent ${id} finished.`
      : `Cursor background agent ${id} needs attention.`);

  return {
    id: headers.deliveryId ?? `cursor-background:${id}:${status}`,
    type: status === 'FINISHED' ? 'task_completed' : 'attention_required',
    message,
    source: 'external_agent',
    agent: 'cursor-background',
    priority: status === 'FINISHED' ? 'low' : 'high',
    timestamp:
      typeof payload.timestamp === 'string' && !Number.isNaN(Date.parse(payload.timestamp))
        ? Date.parse(payload.timestamp)
        : Date.now(),
    correlationId: `cursor-background:${id}:${status}`,
    metadata: {
      cursor: {
        deliveryId: headers.deliveryId,
        event: 'statusChange',
        status,
        url: readNestedString(payload, ['target', 'url']),
        branchName: readNestedString(payload, ['target', 'branchName']),
        prUrl: readNestedString(payload, ['target', 'prUrl']),
        repository: readNestedString(payload, ['source', 'repository']),
        ref: readNestedString(payload, ['source', 'ref']),
        userAgent: headers.userAgent,
      },
    },
  };
}

function readNestedString(payload: Record<string, unknown>, path: [string, string]): string | undefined {
  const value = payload[path[0]];
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const nested = value as Record<string, unknown>;
  return typeof nested[path[1]] === 'string' ? nested[path[1]] : undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function deriveCursorWebhookSecret(
  masterSecret: string,
  installId: string,
  salt: string,
  version: number,
): Promise<string> {
  const encoded = new TextEncoder().encode(`${masterSecret}:${installId}:${salt}:${version}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(new Uint8Array(digest)).slice(0, 48);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return undefined;
  }

  return header.slice('Bearer '.length).trim();
}
