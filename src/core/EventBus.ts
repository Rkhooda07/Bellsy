import { EventEmitter } from 'events';

import { AgentEvent, AgentEventType } from './types';

class TypedEventBus extends EventEmitter {
  private static instance: TypedEventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): TypedEventBus {
    if (!TypedEventBus.instance) {
      TypedEventBus.instance = new TypedEventBus();
    }

    return TypedEventBus.instance;
  }

  override emit(event: AgentEventType, payload: AgentEvent): boolean {
    return super.emit(event, payload);
  }

  override on(event: AgentEventType, listener: (payload: AgentEvent) => void): this {
    return super.on(event, listener);
  }
}

const EventBus = TypedEventBus.getInstance();

export default EventBus;
