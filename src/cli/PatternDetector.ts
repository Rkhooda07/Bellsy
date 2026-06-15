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

const ANSI_PATTERN = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[=>])/g;
const BACKSPACE_PATTERN = /[^\u0008]\u0008/g;
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
  /\bresponse complete(?:d)?\b/i,
  /\bfinished generating\b/i,
  /\bgeneration complete\b/i,
  /\bgenerat(?:ion|ing) (?:is )?(?:complete|finished)\b/i,
  /\bturn (?:complete|finished)\b/i,
  /(?:^|[\r\n\s])done[.!]?(?:[\r\n\s]|$)/i,
];
const DEFAULT_FAILURE_PATTERNS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bneeds attention\b/i,
  /\bexited with code\b/i,
];
const ACTIVITY_PATTERNS = [
  /\bgenerating(?: response)?\b/i,
  /\bthinking\b/i,
  /\bprocessing\b/i,
  /(?:^|[\r\n])\s*(?:[✦●⏺◆◇▪■]|blackbox\s*:|gemini\s*:|claude\s*:)\s+/i,
];
const RETURNED_TO_PROMPT_PATTERNS = [
  /(?:^|[\r\n])\s*(?:[│┃|]\s*)?>\s*$/m,
  /(?:^|[\r\n])\s*(?:[│┃|]\s*)?(?:ask|message|prompt)\s*>?\s*$/im,
  /(?:^|[\r\n])\s*(?:╭|┌|[│┃|]).{0,80}>\s*$/m,
];
const TUI_AGENT_PATTERN = /^(claude|claude-code|gemini|blackbox)$/i;

export class PatternDetector {
  private readonly permissionPatterns: RegExp[];
  private readonly completionPatterns: RegExp[];
  private readonly failurePatterns: RegExp[];
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private buffer = '';
  private sawAgentActivity = false;
  private readonly lastEmitted = new Map<string, number>();
  private readonly emittedTypes = new Set<AgentEventType>();

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
    const recentText = this.recentText(clean);

    if (this.matches(ACTIVITY_PATTERNS, recentText)) {
      this.sawAgentActivity = true;
    }

    const events: DetectedCliEvent[] = [];
    if (this.matches(this.permissionPatterns, this.buffer) && this.canEmit(AgentEventType.PERMISSION_REQUIRED)) {
      this.buffer = '';
      events.push({
        type: AgentEventType.PERMISSION_REQUIRED,
        message: this.formatMessage('Waiting for confirmation'),
        priority: AgentEventPriority.HIGH,
        confidence: 'high',
      });
    }

    if (
      this.sawAgentActivity &&
      (
        this.matches(this.completionPatterns, recentText) ||
        (this.shouldDetectPromptReturn() && this.matches(RETURNED_TO_PROMPT_PATTERNS, this.recentLine()))
      ) &&
      this.canEmit(AgentEventType.TASK_COMPLETED)
    ) {
      this.sawAgentActivity = false;
      this.buffer = '';
      events.push({
        type: AgentEventType.TASK_COMPLETED,
        message: this.formatMessage('Response completed'),
        priority: AgentEventPriority.LOW,
        confidence: 'medium',
      });
    }

    if (this.matches(this.failurePatterns, recentText) && this.canEmit(AgentEventType.ATTENTION_REQUIRED)) {
      this.buffer = '';
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
      if (this.emittedTypes.has(AgentEventType.TASK_COMPLETED) || !this.canEmit(AgentEventType.TASK_COMPLETED)) {
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

    if (this.emittedTypes.has(AgentEventType.ATTENTION_REQUIRED) || !this.canEmit(AgentEventType.ATTENTION_REQUIRED)) {
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
    let clean = value.replace(ANSI_PATTERN, '');
    while (clean.includes('\u0008')) {
      clean = clean.replace(BACKSPACE_PATTERN, '');
    }

    return clean;
  }

  private matches(patterns: RegExp[], value: string): boolean {
    return patterns.some((pattern) => pattern.test(value));
  }

  private recentLine(): string {
    const lines = this.buffer.split(/[\r\n]/).filter((line) => line.trim().length > 0);
    return lines.at(-1) ?? this.buffer;
  }

  private recentText(chunk: string): string {
    const lines = this.buffer.split(/[\r\n]/).filter((line) => line.trim().length > 0);
    return `${chunk}\n${lines.slice(-6).join('\n')}`.slice(-4096);
  }

  private shouldDetectPromptReturn(): boolean {
    return this.sawAgentActivity && TUI_AGENT_PATTERN.test(this.options.agent ?? '');
  }

  private canEmit(type: AgentEventType): boolean {
    const key = `${type}:${this.options.agent ?? 'unknown'}`;
    const currentTime = this.now();
    const lastTime = this.lastEmitted.get(key) ?? 0;
    if (currentTime - lastTime < this.cooldownMs) {
      return false;
    }

    this.lastEmitted.set(key, currentTime);
    this.emittedTypes.add(type);
    return true;
  }

  private formatMessage(message: string): string {
    return this.options.agent ? `${this.options.agent}: ${message}` : message;
  }
}
