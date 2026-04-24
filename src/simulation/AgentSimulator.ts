import { v4 as uuid } from 'uuid';

import EventBus from '../core/EventBus';
import { AgentEventPriority, AgentEventSource, AgentEventType } from '../core/types';

export class AgentSimulator {
  emitPermissionRequest(message = 'AI wants to run: npm install'): void {
    EventBus.emit(AgentEventType.PERMISSION_REQUIRED, {
      id: uuid(),
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
      id: uuid(),
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
