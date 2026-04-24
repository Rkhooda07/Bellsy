import { v4 as uuid } from 'uuid';

import { AgentEvent, AgentEventPriority, AgentEventSource, AgentEventType } from './types';

type EventDefaults = {
  source?: AgentEventSource;
  priority?: AgentEventPriority;
};

export function parseEvent(raw: unknown, defaults: EventDefaults = {}): AgentEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Event payload must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;
  const type = record.type;
  const message = record.message;
  const id = record.id;
  const source = record.source;
  const priority = record.priority;
  const timestamp = record.timestamp;
  const agent = record.agent;
  const workspace = record.workspace;
  const correlationId = record.correlationId;
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

  if (source !== undefined && !Object.values(AgentEventSource).includes(source as AgentEventSource)) {
    throw new Error(`Unknown event source: ${String(source)}`);
  }

  if (priority !== undefined && !Object.values(AgentEventPriority).includes(priority as AgentEventPriority)) {
    throw new Error(`Unknown event priority: ${String(priority)}`);
  }

  if (timestamp !== undefined && typeof timestamp !== 'number') {
    throw new Error('Event timestamp must be a number when provided.');
  }

  if (agent !== undefined && typeof agent !== 'string') {
    throw new Error('Event agent must be a string when provided.');
  }

  if (workspace !== undefined && typeof workspace !== 'string') {
    throw new Error('Event workspace must be a string when provided.');
  }

  if (correlationId !== undefined && typeof correlationId !== 'string') {
    throw new Error('Event correlationId must be a string when provided.');
  }

  if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
    throw new Error('Event metadata must be an object when provided.');
  }

  const eventType = type as AgentEventType;

  return {
    id: id ?? uuid(),
    type: eventType,
    source: (source as AgentEventSource | undefined) ?? defaults.source ?? AgentEventSource.EXTERNAL_AGENT,
    message: message.trim(),
    priority: (priority as AgentEventPriority | undefined) ?? defaults.priority ?? defaultPriority(eventType),
    timestamp: timestamp ?? Date.now(),
    agent,
    workspace,
    correlationId,
    metadata: (metadata as Record<string, unknown> | undefined) ?? {},
  };
}

function defaultPriority(type: AgentEventType): AgentEventPriority {
  return type === AgentEventType.PERMISSION_REQUIRED ? AgentEventPriority.HIGH : AgentEventPriority.LOW;
}
