export const EXTENSION_ID = 'ai-agent-notifier';
export const OUTPUT_CHANNEL_NAME = 'AI Agent Notifier';
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 9001;
export const DEFAULT_WATCH_FILE_PATH = '/tmp/agent_event.json';
export const DEFAULT_HTTP_RESPONSE_TIMEOUT_MS = 300_000;
export const DEFAULT_SOUND_VOLUME = 45;
export const SOUND_FILES = {
  permission: 'permission_alert.wav',
  completed: 'task_complete.wav',
} as const;
