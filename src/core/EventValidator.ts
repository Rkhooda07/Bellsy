import { v4 as uuid } from 'uuid';

import { AgentEvent, AgentEventType } from './types';

export function parseEvent(raw: unknown): AgentEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Event payload must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;
  const type = record.type;
  const message = record.message;
  const id = record.id;
  const timestamp = record.timestamp;
  const metadata = record.metadata;

  if (!Object.values(AgentEventType).includes(type as AgentEventType)) {
    throw new Error(`Unknown event type: ${String(type)}`);
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Event message must be a non-empty string.');
  }

  if (id !== undefined && typeof id !== 'string') {
    throw new Error('Event id must be a string when provided.');
  }

  if (timestamp !== undefined && typeof timestamp !== 'number') {
    throw new Error('Event timestamp must be a number when provided.');
  }

  if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
    throw new Error('Event metadata must be an object when provided.');
  }

  return {
    id: id ?? uuid(),
    type: type as AgentEventType,
    message: message.trim(),
    timestamp: timestamp ?? Date.now(),
    metadata: (metadata as Record<string, unknown> | undefined) ?? {},
  };
}
