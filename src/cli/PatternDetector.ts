import { AgentEventPriority, AgentEventType } from '../core/types';

export type DetectedCliEvent = {
  type: AgentEventType;
  message: string;
  priority: AgentEventPriority;
  confidence: 'high' | 'medium';
  correlationId?: string;
};

type DetectorOptions = {
  agent?: string;
  permissionPatterns?: RegExp[];
  completionPatterns?: RegExp[];
  failurePatterns?: RegExp[];
  cooldownMs?: number;
  now?: () => number;
};

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_PERMISSION_PATTERNS = [
  /\bwaiting for confirmation\b/i,
  /\bpermission required\b/i,
  /\baction required\b/i,
  /\bneeds approval\b/i,
  /\ballow(?: this)? command\b/i,
  /\bdo you want to (?:proceed|continue)\b/i,
  /\bconfirm\b.*(?:\[y\/n\]|\[y\/N\]|\(y\/n\)|\(yes\/no\))/i,
  /(?:\[y\/N\]|\[y\/n\]|\(y\/n\)|\(yes\/no\))/i,
];
const DEFAULT_COMPLETION_PATTERNS = [
  /\btask finished\b/i,
  /\bcompleted successfully\b/i,
  /\bresponse finished\b/i,
  /\bfinished generating\b/i,
  /\bgeneration complete\b/i,
  /(?:^|\s)done[.!]?\s*$/i,
];
const DEFAULT_FAILURE_PATTERNS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bneeds attention\b/i,
  /\bexited with code\b/i,
];

export class PatternDetector {
  private readonly permissionPatterns: RegExp[];
  private readonly completionPatterns: RegExp[];
  private readonly failurePatterns: RegExp[];
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private buffer = '';
  private readonly lastEmitted = new Map<string, number>();

  constructor(private readonly options: DetectorOptions = {}) {
    this.permissionPatterns = options.permissionPatterns ?? DEFAULT_PERMISSION_PATTERNS;
    this.completionPatterns = options.completionPatterns ?? DEFAULT_COMPLETION_PATTERNS;
    this.failurePatterns = options.failurePatterns ?? DEFAULT_FAILURE_PATTERNS;
    this.cooldownMs = options.cooldownMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  ingest(chunk: string): DetectedCliEvent[] {
    const clean = this.stripAnsi(chunk);
    this.buffer = `${this.buffer}${clean}`.slice(-8192);

    const events: DetectedCliEvent[] = [];
    if (this.matches(this.permissionPatterns, this.buffer) && this.canEmit(AgentEventType.PERMISSION_REQUIRED)) {
      events.push({
        type: AgentEventType.PERMISSION_REQUIRED,
        message: this.formatMessage('Waiting for confirmation'),
        priority: AgentEventPriority.HIGH,
        confidence: 'high',
      });
    }

    if (this.matches(this.completionPatterns, this.recentLine()) && this.canEmit(AgentEventType.TASK_COMPLETED)) {
      events.push({
        type: AgentEventType.TASK_COMPLETED,
        message: this.formatMessage('Task finished'),
        priority: AgentEventPriority.LOW,
        confidence: 'medium',
      });
    }

    if (this.matches(this.failurePatterns, this.recentLine()) && this.canEmit(AgentEventType.ATTENTION_REQUIRED)) {
      events.push({
        type: AgentEventType.ATTENTION_REQUIRED,
        message: this.formatMessage('Task needs attention'),
        priority: AgentEventPriority.HIGH,
        confidence: 'medium',
      });
    }

    return events;
  }

  onExit(exitCode: number | null): DetectedCliEvent[] {
    if (exitCode === 0) {
      if (!this.canEmit(AgentEventType.TASK_COMPLETED)) {
        return [];
      }

      return [
        {
          type: AgentEventType.TASK_COMPLETED,
          message: this.formatMessage('Process completed successfully'),
          priority: AgentEventPriority.LOW,
          confidence: 'high',
        },
      ];
    }

    if (!this.canEmit(AgentEventType.ATTENTION_REQUIRED)) {
      return [];
    }

    return [
      {
        type: AgentEventType.ATTENTION_REQUIRED,
        message: this.formatMessage(`Process exited with code ${exitCode ?? 1}`),
        priority: AgentEventPriority.HIGH,
        confidence: 'high',
      },
    ];
  }

  private stripAnsi(value: string): string {
    return value.replace(ANSI_PATTERN, '');
  }

  private matches(patterns: RegExp[], value: string): boolean {
    return patterns.some((pattern) => pattern.test(value));
  }

  private recentLine(): string {
    const lines = this.buffer.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines.at(-1) ?? this.buffer;
  }

  private canEmit(type: AgentEventType): boolean {
    const key = `${type}:${this.options.agent ?? 'unknown'}`;
    const currentTime = this.now();
    const lastTime = this.lastEmitted.get(key) ?? 0;
    if (currentTime - lastTime < this.cooldownMs) {
      return false;
    }

    this.lastEmitted.set(key, currentTime);
    return true;
  }

  private formatMessage(message: string): string {
    return this.options.agent ? `${this.options.agent}: ${message}` : message;
  }
}
