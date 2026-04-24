import { AgentEvent } from './types';

type EventRouterOptions = {
  dedupeWindowMs?: number;
  rateLimitWindowMs?: number;
  now?: () => number;
};

export class EventRouter {
  private readonly dedupeWindowMs: number;
  private readonly rateLimitWindowMs: number;
  private readonly now: () => number;
  private readonly seenEvents = new Map<string, number>();
  private readonly lastBySourceAndType = new Map<string, number>();

  constructor(options: EventRouterOptions = {}) {
    this.dedupeWindowMs = options.dedupeWindowMs ?? 10_000;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 750;
    this.now = options.now ?? Date.now;
  }

  shouldRoute(event: AgentEvent): boolean {
    this.prune();

    const currentTime = this.now();
    const dedupeKey = this.dedupeKey(event);
    if (this.seenEvents.has(dedupeKey)) {
      return false;
    }

    const rateLimitKey = this.rateLimitKey(event);
    const lastByKey = this.lastBySourceAndType.get(rateLimitKey) ?? 0;
    if (currentTime - lastByKey < this.rateLimitWindowMs) {
      return false;
    }

    this.seenEvents.set(dedupeKey, currentTime);
    this.lastBySourceAndType.set(rateLimitKey, currentTime);
    return true;
  }

  private dedupeKey(event: AgentEvent): string {
    return event.correlationId ?? `${event.source}:${event.type}:${event.message.toLowerCase()}`;
  }

  private rateLimitKey(event: AgentEvent): string {
    return `${event.source}:${event.type}:${event.agent ?? 'unknown'}`;
  }

  private prune(): void {
    const cutoff = this.now() - this.dedupeWindowMs;
    for (const [key, timestamp] of this.seenEvents) {
      if (timestamp < cutoff) {
        this.seenEvents.delete(key);
      }
    }
  }
}
