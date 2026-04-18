import * as http from 'http';

import { DEFAULT_HTTP_HOST } from '../core/constants';
import { parseEvent } from '../core/EventValidator';
import { AgentEvent, AgentEventType, PermissionResponse } from '../core/types';
import { OutputChannelLogger } from '../services/OutputChannelLogger';
import { IResponseTarget } from '../services/ResponseDispatcher';

import { ITransport } from './ITransport';

type PendingRequest = {
  resolve: (response: PermissionResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class HttpTransport implements ITransport, IResponseTarget {
  private server?: http.Server;
  private callback?: (event: AgentEvent) => void;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly port: number,
    private readonly responseTimeoutMs: number,
    private readonly logger: OutputChannelLogger,
  ) {}

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', (error) => {
        this.logger.error(`HTTP transport failed to start: ${error instanceof Error ? error.message : String(error)}`);
        reject(error);
      });
      this.server?.listen(this.port, DEFAULT_HTTP_HOST, () => resolve());
    });

    this.logger.info(`HTTP transport listening on http://${DEFAULT_HTTP_HOST}:${this.port}/event`);
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/event') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      const rawPayload = JSON.parse(body) as unknown;
      const event = parseEvent(rawPayload);

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
}
