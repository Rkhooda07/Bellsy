import * as crypto from 'crypto';
import * as vscode from 'vscode';

import { AgentEvent } from '../core/types';
import { OutputChannelLogger } from '../services/OutputChannelLogger';

import { MinimalWebSocketClient } from './MinimalWebSocketClient';
import { RelayHttpClient, RelayRegistration } from './RelayHttpClient';

const RELAY_STATE_KEY = 'relay.credentials';
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export type RelayConnectionStatus = 'offline' | 'registering' | 'restoring' | 'connecting' | 'connected' | 'reconnecting';

type RelayCredentials = RelayRegistration;

type RelayEnvelope = {
  event?: AgentEvent;
  type?: string;
};

export class HostedRelayService implements vscode.Disposable {
  private readonly client = new RelayHttpClient();
  private readonly statusEmitter = new vscode.EventEmitter<RelayConnectionStatus>();
  private readonly eventEmitter = new vscode.EventEmitter<AgentEvent>();
  private readonly errorEmitter = new vscode.EventEmitter<string>();
  private credentials?: RelayCredentials;
  private status: RelayConnectionStatus = 'offline';
  private socket?: MinimalWebSocketClient;
  private heartbeat?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private disposed = false;
  private startPromise?: Promise<void>;

  readonly onStatusDidChange = this.statusEmitter.event;
  readonly onEventReceived = this.eventEmitter.event;
  readonly onError = this.errorEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: OutputChannelLogger,
    private readonly baseUrl: string,
  ) {}

  async start(): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.status === 'connected' || this.status === 'connecting' || this.status === 'reconnecting') {
      return;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  getStatus(): RelayConnectionStatus {
    return this.status;
  }

  getCredentials(): RelayCredentials | undefined {
    return this.credentials;
  }

  isConfigured(): boolean {
    return this.baseUrl.trim().length > 0;
  }

  async rotateSecret(): Promise<RelayCredentials> {
    const credentials = await this.requireCredentials();
    const updated = await this.client.rotateSecret(this.baseUrl, credentials.installId, credentials.deviceToken);
    await this.saveCredentials(updated);
    this.logger.info(`Relay secret rotated for install ${updated.installId}.`);
    return updated;
  }

  async sendTestWebhook(status: 'FINISHED' | 'ERROR'): Promise<void> {
    const credentials = await this.requireCredentials();
    const deliveryId = `relay_test_${Date.now()}`;
    const body = JSON.stringify({
      event: 'statusChange',
      timestamp: new Date().toISOString(),
      id: deliveryId,
      status,
      summary:
        status === 'FINISHED'
          ? 'Cursor background agent finished successfully.'
          : 'Cursor background agent needs attention.',
      target: {
        url: `https://cursor.com/agents?id=${deliveryId}`,
      },
    });
    const signature = `sha256=${crypto
      .createHmac('sha256', credentials.cursorWebhookSecret)
      .update(body)
      .digest('hex')}`;

    await this.client.postSignedWebhook(credentials.publicWebhookUrl, body, signature, deliveryId);
    this.logger.info(`Hosted relay webhook test accepted (${status}).`);
  }

  dispose(): void {
    this.disposed = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
    this.statusEmitter.dispose();
    this.eventEmitter.dispose();
    this.errorEmitter.dispose();
  }

  private async startInternal(): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Hosted relay is not configured. Set agentNotifier.relayBaseUrl to enable Cursor webhook relay mode.');
      this.setStatus('offline');
      return;
    }

    const stored = this.context.globalState.get<RelayCredentials>(RELAY_STATE_KEY);

    try {
      if (!stored) {
        this.setStatus('registering');
        const registered = await this.client.register(this.baseUrl);
        await this.saveCredentials(registered);
        this.logger.info(`Relay registered new install ${registered.installId}.`);
      } else {
        this.credentials = stored;
        this.setStatus('restoring');
        const restored = await this.client.restore(this.baseUrl, stored.installId, stored.deviceToken);
        await this.saveCredentials(restored);
        this.logger.info(`Relay restored install ${restored.installId}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus('offline');
      this.logger.error(`Hosted relay registration failed: ${message}`);
      this.errorEmitter.fire(message);
      return;
    }

    await this.connect();
  }

  private async connect(): Promise<void> {
    const credentials = await this.requireCredentials();

    if (this.disposed) {
      return;
    }

    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    this.socket?.close();

    const socket = new MinimalWebSocketClient({
      url: credentials.relayWebSocketUrl,
      headers: {
        authorization: `Bearer ${credentials.deviceToken}`,
      },
      onMessage: (message) => this.handleSocketMessage(message),
      onClose: () => this.handleSocketClose(),
      onError: (error) => this.handleSocketError(error),
    });

    try {
      await socket.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Hosted relay connect failed: ${message}`);
      this.setStatus('reconnecting');
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    this.reconnectAttempt = 0;
    this.startHeartbeat();
    this.setStatus('connected');
    this.logger.info(`Hosted relay connected for install ${credentials.installId}.`);
  }

  private handleSocketMessage(message: string): void {
    let parsed: RelayEnvelope;

    try {
      parsed = JSON.parse(message) as RelayEnvelope;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Hosted relay sent invalid JSON: ${errorMessage}`);
      return;
    }

    if (parsed.type === 'pong') {
      return;
    }

    if (!parsed.event) {
      this.logger.warn('Hosted relay message missing event payload.');
      return;
    }

    this.logger.info(`Hosted relay webhook received: ${parsed.event.type} (${parsed.event.id})`);
    this.eventEmitter.fire(parsed.event);
  }

  private handleSocketClose(): void {
    if (this.disposed) {
      return;
    }

    this.stopHeartbeat();
    this.socket = undefined;
    this.setStatus('reconnecting');
    this.logger.warn('Hosted relay disconnected. Reconnecting.');
    this.scheduleReconnect();
  }

  private handleSocketError(error: Error): void {
    if (this.disposed) {
      return;
    }

    this.logger.warn(`Hosted relay socket error: ${error.message}`);
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      try {
        this.socket?.sendText(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Hosted relay heartbeat failed: ${message}`);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }

  private async requireCredentials(): Promise<RelayCredentials> {
    if (this.credentials) {
      return this.credentials;
    }

    const stored = this.context.globalState.get<RelayCredentials>(RELAY_STATE_KEY);
    if (!stored) {
      throw new Error('Hosted relay credentials are not available yet.');
    }

    this.credentials = stored;
    return stored;
  }

  private async saveCredentials(credentials: RelayCredentials): Promise<void> {
    this.credentials = credentials;
    await this.context.globalState.update(RELAY_STATE_KEY, credentials);
  }

  private setStatus(status: RelayConnectionStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.statusEmitter.fire(status);
  }
}
