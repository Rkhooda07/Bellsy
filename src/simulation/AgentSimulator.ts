import { randomUUID } from 'crypto';

import EventBus from '../core/EventBus';
import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

export class AgentSimulator {
  emitPermissionRequest(message = 'AI wants to run: npm install'): void {
    EventBus.emit(AgentEventType.PERMISSION_REQUIRED, {
      id: randomUUID(),
      type: AgentEventType.PERMISSION_REQUIRED,
      source: AgentEventSource.SIMULATOR,
      message,
      priority: AgentEventPriority.HIGH,
      timestamp: Date.now(),
      metadata: {
        source: 'simulator',
      },
    });
  }

  emitTaskCompleted(message = 'AI has finished generating a response'): void {
    EventBus.emit(AgentEventType.TASK_COMPLETED, {
      id: randomUUID(),
      type: AgentEventType.TASK_COMPLETED,
      source: AgentEventSource.SIMULATOR,
      message,
      priority: AgentEventPriority.LOW,
      timestamp: Date.now(),
      metadata: {
        source: 'simulator',
      },
    });
  }
}
