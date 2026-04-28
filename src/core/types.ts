export enum AgentEventType {
  PERMISSION_REQUIRED = 'permission_required',
  ATTENTION_REQUIRED = 'attention_required',
  TASK_COMPLETED = 'task_completed',
}

export enum AgentEventSource {
  VSCODE = 'vscode',
  CLI = 'cli',
  EXTERNAL_AGENT = 'external_agent',
  FILE = 'file',
  HTTP = 'http',
  SIMULATOR = 'simulator',
}

export enum AgentEventPriority {
  HIGH = 'high',
  LOW = 'low',
}

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  source: AgentEventSource;
  message: string;
  priority: AgentEventPriority;
  timestamp: number;
  agent?: string;
  workspace?: string;
  correlationId?: string;
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
  relayBaseUrl: string;
  cursorWebhookSecret: string;
  watchFilePath: string;
  watchResponseFilePath: string;
  soundEnabled: boolean;
  soundVolume: number;
  httpResponseTimeoutMs: number;
  permissionReminderEnabled: boolean;
  permissionReminderIntervalSeconds: number;
}
