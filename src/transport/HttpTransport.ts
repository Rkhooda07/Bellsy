import * as http from 'http';

import { CURSOR_WEBHOOK_PATH, DEFAULT_HTTP_HOST } from '../core/constants';
import { parseEvent } from '../core/EventValidator';
import { AgentEvent, AgentEventSource, AgentEventType, PermissionResponse } from '../core/types';
import { parseCursorWebhook } from '../integrations/CursorWebhook';
import { OutputChannelLogger } from '../services/OutputChannelLogger';
import { IResponseTarget } from '../services/ResponseDispatcher';

import { ITransport } from './ITransport';

type PendingRequest = {
  resolve: (response: PermissionResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type HttpTransportOptions = {
  cursorWebhookEnabled?: boolean;
  cursorWebhookSecret?: string;
};

export class HttpTransport implements ITransport, IResponseTarget {
  private server?: http.Server;
  private callback?: (event: AgentEvent) => void;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private activePort?: number;
  private readonly cursorWebhookEnabled: boolean;
  private readonly cursorWebhookSecret: string;

  constructor(
    private readonly port: number,
    private readonly responseTimeoutMs: number,
    private readonly logger: OutputChannelLogger,
    options: HttpTransportOptions = {},
  ) {
    this.cursorWebhookEnabled = options.cursorWebhookEnabled ?? false;
    this.cursorWebhookSecret = options.cursorWebhookSecret ?? '';
  }

  async start(): Promise<void> {
    this.server = await this.createListeningServer(this.port);

    const address = this.server.address();
    this.activePort = typeof address === 'object' && address ? address.port : this.port;
    this.logger.info(`HTTP transport listening on http://${DEFAULT_HTTP_HOST}:${this.activePort}/event`);
    if (this.cursorWebhookEnabled) {
      this.logger.info(
        `Experimental Cursor webhook endpoint listening on http://${DEFAULT_HTTP_HOST}:${this.activePort}${CURSOR_WEBHOOK_PATH}`,
      );
    }
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callback = callback;
  }

  async stop(): Promise<void> {
    for (const [eventId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Transport stopped before responding to ${eventId}`));
    }
    this.pendingRequests.clear();

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.server = undefined;
    this.activePort = undefined;
  }

  getEventEndpoint(): string | undefined {
    if (!this.activePort) {
      return undefined;
    }

    return `http://${DEFAULT_HTTP_HOST}:${this.activePort}/event`;
  }

  async send(response: PermissionResponse): Promise<void> {
    const pending = this.pendingRequests.get(response.eventId);
    if (!pending) {
      this.logger.warn(`No pending HTTP request found for response ${response.eventId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.eventId);
    pending.resolve(response);
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (req.url === '/event') {
      await this.handleGenericEventRequest(req, res);
      return;
    }

    if (this.cursorWebhookEnabled && req.url === CURSOR_WEBHOOK_PATH) {
      await this.handleCursorWebhookRequest(req, res);
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleGenericEventRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const rawPayload = JSON.parse(body) as unknown;
      const event = parseEvent(rawPayload, { source: AgentEventSource.HTTP });

      if (event.type === AgentEventType.PERMISSION_REQUIRED) {
        const response = await this.awaitPermissionResponse(event);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'responded', ...response }));
        return;
      }

      this.callback?.(event);
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted', id: event.id }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = this.statusCodeForError(error);
      this.logger.warn(`HTTP transport request failed (${statusCode}): ${message}`);
      res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  }

  private async handleCursorWebhookRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const event = parseCursorWebhook(
        body,
        {
          signature: this.readHeader(req, 'x-webhook-signature'),
          deliveryId: this.readHeader(req, 'x-webhook-id'),
          event: this.readHeader(req, 'x-webhook-event'),
          userAgent: this.readHeader(req, 'user-agent'),
        },
        this.cursorWebhookSecret,
      );

      if (!event) {
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ignored' }));
        return;
      }

      this.callback?.(event);
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted', id: event.id }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('signature') ? 401 : this.statusCodeForError(error);
      this.logger.warn(`Cursor webhook request failed (${statusCode}): ${message}`);
      res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  }

  private async awaitPermissionResponse(event: AgentEvent): Promise<PermissionResponse> {
    if (!this.callback) {
      throw new Error('No event handler registered for permission requests.');
    }

    const responsePromise = new Promise<PermissionResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(event.id);
        reject(new Error(`Timed out waiting for a response to event ${event.id}`));
      }, this.responseTimeoutMs);

      this.pendingRequests.set(event.id, { resolve, reject, timeout });
    });

    this.callback(event);
    return responsePromise;
  }

  private statusCodeForError(error: unknown): number {
    if (error instanceof SyntaxError) {
      return 400;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Unknown event type:') || message.includes('Event ')) {
      return 400;
    }

    if (message.startsWith('Timed out waiting for a response')) {
      return 504;
    }

    if (message === 'No event handler registered for permission requests.') {
      return 503;
    }

    return 500;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', (chunk: Buffer | string) => {
        body += chunk.toString();
      });

      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private readHeader(req: http.IncomingMessage, name: string): string | undefined {
    const header = req.headers[name];
    if (Array.isArray(header)) {
      return header[0];
    }

    return header;
  }

  private async createListeningServer(preferredPort: number): Promise<http.Server> {
    try {
      return await this.listenOnPort(preferredPort);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== 'EADDRINUSE') {
        this.logger.error(`HTTP transport failed to start: ${message}`);
        throw error;
      }

      this.logger.warn(
        `HTTP port ${preferredPort} is already in use. Pingly will use another available local port for this editor instance.`,
      );
      return this.listenOnPort(0);
    }
  }

  private async listenOnPort(port: number): Promise<http.Server> {
    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', (error) => {
        reject(error);
      });
      server.listen(port, DEFAULT_HTTP_HOST, () => resolve());
    });

    return server;
  }
}
