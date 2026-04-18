export enum AgentEventType {
  PERMISSION_REQUIRED = 'permission_required',
  TASK_COMPLETED = 'task_completed',
}

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PermissionResponse {
  eventId: string;
  allowed: boolean;
  respondedAt: number;
}

export interface AgentNotifierConfig {
  transport: 'file' | 'http';
  httpPort: number;
  watchFilePath: string;
  watchResponseFilePath: string;
  soundEnabled: boolean;
  soundVolume: number;
  httpResponseTimeoutMs: number;
  permissionReminderEnabled: boolean;
  permissionReminderIntervalSeconds: number;
}
