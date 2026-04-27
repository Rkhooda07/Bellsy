import * as crypto from 'crypto';

import { AgentEvent, AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

type CursorWebhookHeaders = {
  signature?: string;
  deliveryId?: string;
  event?: string;
  userAgent?: string;
};

type CursorWebhookPayload = {
  event?: string;
  timestamp?: string;
  id?: string;
  status?: string;
  summary?: string;
  source?: {
    repository?: string;
    ref?: string;
  };
  target?: {
    url?: string;
    branchName?: string;
    prUrl?: string;
  };
};

export function verifyCursorWebhook(secret: string, rawBody: string, signature: string): boolean {
  const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

export function parseCursorWebhook(rawBody: string, headers: CursorWebhookHeaders, secret?: string): AgentEvent | null {
  if (secret && secret.trim().length > 0) {
    if (!headers.signature) {
      throw new Error('Cursor webhook signature is required when a secret is configured.');
    }

    if (!verifyCursorWebhook(secret, rawBody, headers.signature)) {
      throw new Error('Cursor webhook signature verification failed.');
    }
  }

  const payload = JSON.parse(rawBody) as CursorWebhookPayload;
  const webhookEvent = payload.event ?? headers.event;

  if (webhookEvent !== 'statusChange') {
    return null;
  }

  const status = payload.status?.toUpperCase();
  if (status !== 'FINISHED' && status !== 'ERROR') {
    return null;
  }

  const summary = payload.summary?.trim();
  const message = summary && summary.length > 0 ? summary : fallbackMessage(status, payload.id);
  const correlationId = payload.id ? `cursor-background:${payload.id}:${status}` : undefined;

  return {
    id: headers.deliveryId ?? correlationId ?? crypto.randomUUID(),
    type: status === 'FINISHED' ? AgentEventType.TASK_COMPLETED : AgentEventType.ATTENTION_REQUIRED,
    source: AgentEventSource.EXTERNAL_AGENT,
    agent: 'cursor-background',
    message,
    priority: status === 'FINISHED' ? AgentEventPriority.LOW : AgentEventPriority.HIGH,
    timestamp: payload.timestamp ? Date.parse(payload.timestamp) || Date.now() : Date.now(),
    correlationId,
    metadata: {
      cursor: {
        event: webhookEvent,
        status,
        deliveryId: headers.deliveryId,
        url: payload.target?.url,
        branchName: payload.target?.branchName,
        prUrl: payload.target?.prUrl,
        repository: payload.source?.repository,
        ref: payload.source?.ref,
        userAgent: headers.userAgent,
      },
    },
  };
}

function fallbackMessage(status: 'FINISHED' | 'ERROR', agentId?: string): string {
  if (status === 'FINISHED') {
    return agentId ? `Cursor background agent ${agentId} finished.` : 'Cursor background agent finished.';
  }

  return agentId ? `Cursor background agent ${agentId} needs attention.` : 'Cursor background agent needs attention.';
}
