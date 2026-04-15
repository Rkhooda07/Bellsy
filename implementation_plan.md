# 🤖 AI Agent Notifier — VS Code Extension
## Complete Implementation Blueprint

> **Purpose:** Real-time attention and notification system for AI agents — not a chatbot, not a dashboard. Pure signal.

---

## 1. 🏛️ Architecture Breakdown

The extension follows a **layered, event-driven architecture** with a clear separation of concerns:

```
┌──────────────────────────────────────────────────────────┐
│                     VS Code Extension Host               │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │ Event Bus   │───▶│ Notification │───▶│ Sound      │  │
│  │ (Core)      │    │ Service      │    │ Service    │  │
│  └──────┬──────┘    └──────────────┘    └────────────┘  │
│         │                                                │
│  ┌──────▼──────┐    ┌──────────────┐    ┌────────────┐  │
│  │ Permission  │    │ System Notif │    │ Status Bar │  │
│  │ Manager     │    │ Service      │    │ Service    │  │
│  └──────┬──────┘    └──────────────┘    └────────────┘  │
│         │                                                │
│  ┌──────▼──────┐                                        │
│  │ Response    │                                        │
│  │ Dispatcher  │                                        │
│  └─────────────┘                                        │
└──────────────────────────────────────────────────────────┘
         ▲                          │
         │ Events                   │ Allow/Deny
         │                          ▼
┌─────────────────┐       ┌─────────────────┐
│  AI Agent /     │       │   AI Agent /    │
│  Trigger Layer  │       │   Consumer      │
│  (IPC / HTTP /  │       │   (Response)    │
│   File Watch)   │       └─────────────────┘
└─────────────────┘
```

### Architecture Principles

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each service does exactly one thing |
| **Open/Closed** | New event types can be added without modifying core routing |
| **Event-Driven** | Zero polling — pure push model |
| **Non-blocking** | All operations are async/Promise-based |
| **Fail-safe** | Notification failures are isolated — one broken channel never kills another |

---

## 2. 📁 Folder & File Structure

```
VsCodeExten/
├── plan/
│   └── implementation_plan.md         ← This document
│
├── src/
│   ├── extension.ts                   ← Entry point. Registers commands, wires services.
│   │
│   ├── core/
│   │   ├── EventBus.ts                ← Central pub/sub event system
│   │   ├── types.ts                   ← Shared TypeScript interfaces & enums
│   │   └── constants.ts               ← Config values, timeouts, sound paths
│   │
│   ├── services/
│   │   ├── NotificationService.ts     ← VS Code popup handling
│   │   ├── SystemNotifService.ts      ← OS-level notification (node-notifier)
│   │   ├── SoundService.ts            ← Sound playback abstraction
│   │   ├── PermissionManager.ts       ← Permission queue + Allow/Deny flow
│   │   ├── StatusBarService.ts        ← Status bar item management
│   │   └── ResponseDispatcher.ts      ← Sends Allow/Deny back to AI agent
│   │
│   ├── transport/
│   │   ├── ITransport.ts              ← Interface all transports must implement
│   │   ├── HttpTransport.ts           ← Receives events via HTTP server
│   │   ├── FileWatchTransport.ts      ← Watches a JSON file for events (MVP sim)
│   │   └── TransportFactory.ts        ← Selects transport based on config
│   │
│   └── simulation/
│       └── AgentSimulator.ts           ← Dev-only: simulates agent events via commands
│
├── sounds/
│   ├── permission_alert.mp3            ← Loud, urgent attention sound
│   └── task_complete.mp3               ← Soft, calm completion chime
│
├── assets/
│   └── icon.png                        ← Extension icon
│
├── .vscode/
│   └── launch.json                     ← Debug config for extension host
│
├── package.json                        ← Extension manifest + dependencies
├── tsconfig.json                       ← TypeScript config
└── README.md
```

---

## 3. 🧩 Core Modules & Services

### 3.1 `EventBus.ts` — The Heart of the System

The `EventBus` is a typed pub/sub singleton. All event flow passes through it.

```typescript
// core/types.ts
export enum AgentEventType {
  PERMISSION_REQUIRED = 'permission_required',
  TASK_COMPLETED      = 'task_completed',
}

export interface AgentEvent {
  id: string;                     // UUID per event
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
```

```typescript
// core/EventBus.ts
import { EventEmitter } from 'events';
import { AgentEvent, AgentEventType } from './types';

class EventBus extends EventEmitter {
  private static instance: EventBus;

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
      EventBus.instance.setMaxListeners(20);
    }
    return EventBus.instance;
  }

  emit(event: AgentEventType, payload: AgentEvent): boolean {
    return super.emit(event, payload);
  }

  on(event: AgentEventType, listener: (payload: AgentEvent) => void): this {
    return super.on(event, listener);
  }
}

export default EventBus.getInstance();
```

**Why a singleton?** All services need the same bus. Instantiating separate buses would break the event flow silently.

---

### 3.2 `NotificationService.ts` — VS Code Popups

```typescript
// services/NotificationService.ts
import * as vscode from 'vscode';

export class NotificationService {
  async showPermissionRequest(message: string): Promise<'Allow' | 'Deny'> {
    const result = await vscode.window.showWarningMessage(
      `🔔 AI Agent Needs Permission\n${message}`,
      { modal: false },
      'Allow',
      'Deny'
    );
    return (result as 'Allow' | 'Deny') ?? 'Deny'; // Default-deny on dismiss
  }

  showTaskCompleted(message: string): void {
    vscode.window.showInformationMessage(`✅ ${message}`);
  }

  showError(message: string): void {
    vscode.window.showErrorMessage(`❌ ${message}`);
  }
}
```

> **Design Decision:** Permission popups are `await`-ed but run in a non-blocking fire-and-forget context so the extension host thread never stalls.

---

### 3.3 `SystemNotifService.ts` — OS Notifications

Uses `node-notifier` for cross-platform OS alerts (macOS, Windows, Linux).

```typescript
// services/SystemNotifService.ts
import notifier from 'node-notifier';
import path from 'path';

export class SystemNotifService {
  private iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

  notifyPermission(message: string): void {
    notifier.notify({
      title: '🔔 AI Agent — Permission Required',
      message,
      icon: this.iconPath,
      sound: false,       // Sound handled by SoundService separately
      urgency: 'critical', // Linux: highest priority
      timeout: 30,
    });
  }

  notifyCompletion(message: string): void {
    notifier.notify({
      title: '✅ AI Agent — Task Completed',
      message,
      icon: this.iconPath,
      sound: false,
      timeout: 10,
    });
  }
}
```

> **Why disable `sound` in notifier?** macOS and Windows have inconsistent system sound support in `node-notifier`. We own the sound layer explicitly through `SoundService` for guaranteed control.

---

### 3.4 `SoundService.ts` — Sound Playback

Plays audio even when VS Code is minimized because audio is fired at the OS/process level.

```typescript
// services/SoundService.ts
import { exec } from 'child_process';
import path from 'path';
import * as os from 'os';

export class SoundService {
  private soundDir = path.join(__dirname, '..', 'sounds');

  playPermissionAlert(): void {
    this.play('permission_alert.mp3');
  }

  playTaskComplete(): void {
    this.play('task_complete.mp3');
  }

  private play(filename: string): void {
    const fullPath = path.join(this.soundDir, filename);
    const cmd = this.buildCommand(fullPath);
    if (!cmd) return;

    exec(cmd, (err) => {
      if (err) {
        console.error(`[SoundService] Failed to play ${filename}:`, err.message);
      }
    });
  }

  private buildCommand(filePath: string): string | null {
    switch (os.platform()) {
      case 'darwin': return `afplay "${filePath}"`;
      case 'win32':  return `powershell -c (New-Object Media.SoundPlayer "${filePath}").PlaySync()`;
      case 'linux':  return `aplay "${filePath}" 2>/dev/null || paplay "${filePath}"`;
      default:       return null;
    }
  }
}
```

> **Why `exec` over an npm audio package?** Native OS commands have zero dependency footprint, no native bindings to compile, and work reliably across environments. For MVP this is the right tradeoff.

---

### 3.5 `PermissionManager.ts` — Permission Queue

Manages the full lifecycle of a permission event: receive → notify → wait → respond.

```typescript
// services/PermissionManager.ts
import { AgentEvent, PermissionResponse } from '../core/types';
import { NotificationService } from './NotificationService';
import { SystemNotifService } from './SystemNotifService';
import { SoundService } from './SoundService';
import { StatusBarService } from './StatusBarService';
import { ResponseDispatcher } from './ResponseDispatcher';

export class PermissionManager {
  private pending = new Map<string, AgentEvent>();

  constructor(
    private notifService: NotificationService,
    private sysNotif: SystemNotifService,
    private sound: SoundService,
    private statusBar: StatusBarService,
    private dispatcher: ResponseDispatcher,
  ) {}

  async handle(event: AgentEvent): Promise<void> {
    this.pending.set(event.id, event);
    this.statusBar.updatePending(this.pending.size);

    // Fire all channels SIMULTANEOUSLY — no sequential blocking
    const [userChoice] = await Promise.all([
      this.notifService.showPermissionRequest(event.message),
      this.fireSideEffects(event.message),
    ]);

    this.pending.delete(event.id);
    this.statusBar.updatePending(this.pending.size);

    const response: PermissionResponse = {
      eventId: event.id,
      allowed: userChoice === 'Allow',
      respondedAt: Date.now(),
    };

    await this.dispatcher.dispatch(response);
  }

  private async fireSideEffects(message: string): Promise<void> {
    this.sysNotif.notifyPermission(message);
    this.sound.playPermissionAlert();
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
```

> **Key design:** `Promise.all` fires the VS Code popup AND side effects simultaneously. The popup `await` waits for user input, but sounds/OS notifications fire immediately without waiting.

---

### 3.6 `StatusBarService.ts` — Lightweight Status

```typescript
// services/StatusBarService.ts
import * as vscode from 'vscode';

export class StatusBarService {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.item.command = 'agentNotifier.showPendingList';
    this.setIdle();
    this.item.show();
  }

  updatePending(count: number): void {
    if (count === 0) {
      this.setIdle();
    } else {
      this.item.text    = `$(bell) Waiting for permission (${count})`;
      this.item.color   = new vscode.ThemeColor('statusBarItem.warningForeground');
      this.item.tooltip = `${count} AI agent permission request(s) pending`;
    }
  }

  private setIdle(): void {
    this.item.text    = `$(check) AI Agent Ready`;
    this.item.color   = undefined;
    this.item.tooltip = 'AI Agent Notifier — Listening';
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

---

### 3.7 `ResponseDispatcher.ts` — Respond to Agent

```typescript
// services/ResponseDispatcher.ts
import { PermissionResponse } from '../core/types';

export interface IResponseTarget {
  send(response: PermissionResponse): Promise<void>;
}

export class ResponseDispatcher {
  private target: IResponseTarget | null = null;

  setTarget(target: IResponseTarget): void {
    this.target = target;
  }

  async dispatch(response: PermissionResponse): Promise<void> {
    if (!this.target) {
      console.warn('[ResponseDispatcher] No target set — response dropped');
      return;
    }
    await this.target.send(response);
  }
}
```

---

## 4. 📡 Event System Design

### Event Lifecycle (Full Flow)

```
AI Agent emits JSON event
        │
        ▼
Transport Layer receives raw payload
(HTTP POST / File change / IPC message)
        │
        ▼
Parse + Validate → AgentEvent object
        │
        ▼
EventBus.emit(eventType, agentEvent)
        │
        ├──[permission_required]──▶ PermissionManager.handle()
        │                                   │
        │                         ┌─────────▼─────────┐
        │                         │ NotificationService│ ← VS Code popup
        │                         │ SystemNotifService │ ← OS notification
        │                         │ SoundService       │ ← Loud alert sound
        │                         │ StatusBarService   │ ← Update count
        │                         └─────────┬─────────┘
        │                                   │ (await user)
        │                                   ▼
        │                         ResponseDispatcher.dispatch()
        │                                   │
        │                                   ▼
        │                              AI Agent ← Allow/Deny
        │
        └──[task_completed]──▶ TaskCompleteHandler.handle()
                                        │
                                ┌───────▼───────┐
                                │ NotificationS │ ← VS Code info popup
                                │ SystemNotifS  │ ← OS notification
                                │ SoundService  │ ← Soft chime
                                └───────────────┘
                                   (fire + forget)
```

### Event Validation Schema

```typescript
// core/EventValidator.ts
import { v4 as uuid } from 'uuid';
import { AgentEvent, AgentEventType } from './types';

export function parseEvent(raw: unknown): AgentEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Event must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  const type = obj['type'];
  if (!Object.values(AgentEventType).includes(type as AgentEventType)) {
    throw new Error(`Unknown event type: ${type}`);
  }

  if (typeof obj['message'] !== 'string' || obj['message'].trim() === '') {
    throw new Error('Event message must be a non-empty string');
  }

  return {
    id:        (obj['id'] as string) ?? uuid(),
    type:      type as AgentEventType,
    message:   obj['message'] as string,
    timestamp: (obj['timestamp'] as number) ?? Date.now(),
    metadata:  (obj['metadata'] as Record<string, unknown>) ?? {},
  };
}
```

---

## 5. 🚌 Transport Layer Design

The transport layer is the **only** part of the system that touches the outside world.

### Interface

```typescript
// transport/ITransport.ts
import { AgentEvent } from '../core/types';

export interface ITransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(callback: (event: AgentEvent) => void): void;
}
```

### MVP Transport: File Watcher (Phase 1 Simulation)

```typescript
// transport/FileWatchTransport.ts
import * as fs from 'fs';
import { ITransport } from './ITransport';
import { AgentEvent } from '../core/types';
import { parseEvent } from '../core/EventValidator';

export class FileWatchTransport implements ITransport {
  private watcher?: fs.FSWatcher;
  private callback?: (event: AgentEvent) => void;

  constructor(private watchPath: string) {}

  async start(): Promise<void> {
    this.watcher = fs.watch(this.watchPath, () => {
      this.readAndEmit();
    });
  }

  private readAndEmit(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.watchPath, 'utf-8'));
      const event = parseEvent(raw);
      this.callback?.(event);
    } catch (err) {
      console.error('[FileWatchTransport] Parse error:', err);
    }
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callback = callback;
  }

  async stop(): Promise<void> {
    this.watcher?.close();
  }
}
```

### Production Transport: HTTP Server (Phase 2+)

```typescript
// transport/HttpTransport.ts
import * as http from 'http';
import { ITransport } from './ITransport';
import { AgentEvent } from '../core/types';
import { parseEvent } from '../core/EventValidator';

export class HttpTransport implements ITransport {
  private server?: http.Server;
  private callback?: (event: AgentEvent) => void;

  constructor(private port: number = 9001) {}

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/event') {
        res.writeHead(404).end(); return;
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const raw = JSON.parse(body);
          const event = parseEvent(raw);
          this.callback?.(event);
          res.writeHead(200).end(JSON.stringify({ status: 'ok', id: event.id }));
        } catch (err) {
          res.writeHead(400).end(JSON.stringify({ error: String(err) }));
        }
      });
    });

    await new Promise<void>(resolve => this.server!.listen(this.port, '127.0.0.1', resolve));
    console.log(`[HttpTransport] Listening on 127.0.0.1:${this.port}`);
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.callback = callback;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server?.close(err => (err ? reject(err) : resolve()));
    });
  }
}
```

---

## 6. 🎵 Sound System Details

### Sound File Requirements

| File | Duration | Characteristics |
|------|----------|-----------------|
| `permission_alert.mp3` | 1.5–2s | Urgent, multi-tone, attention-grabbing |
| `task_complete.mp3` | 0.5–1s | Soft chime, pleasant, non-jarring |

### Platform Playback Commands

| Platform | Command | Notes |
|----------|---------|-------|
| macOS | `afplay` | Built-in, zero deps |
| Windows | `Media.SoundPlayer` via PowerShell | Built-in |
| Linux | `aplay` → `paplay` | Fallback chain |

### Volume Strategy

- **Permission Alert:** Full amplitude — user **must** hear it
- **Task Complete:** Encode sound file at −12dB relative to permission alert
- **User Override:** Add setting `agentNotifier.soundEnabled` (boolean) and `agentNotifier.soundVolume` (0–100, macOS only via `afplay -v`)

---

## 7. 🔗 Extension Entry Point

```typescript
// extension.ts
import * as vscode from 'vscode';
import EventBus from './core/EventBus';
import { AgentEventType } from './core/types';
import { NotificationService }  from './services/NotificationService';
import { SystemNotifService }   from './services/SystemNotifService';
import { SoundService }         from './services/SoundService';
import { PermissionManager }    from './services/PermissionManager';
import { StatusBarService }     from './services/StatusBarService';
import { ResponseDispatcher }   from './services/ResponseDispatcher';
import { TransportFactory }     from './transport/TransportFactory';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Instantiate services
  const notif      = new NotificationService();
  const sysNotif   = new SystemNotifService();
  const sound      = new SoundService();
  const statusBar  = new StatusBarService();
  const dispatcher = new ResponseDispatcher();

  const permManager = new PermissionManager(
    notif, sysNotif, sound, statusBar, dispatcher
  );

  // 2. Wire EventBus → Services
  EventBus.on(AgentEventType.PERMISSION_REQUIRED, event => {
    permManager.handle(event); // intentionally not awaited at top level
  });

  EventBus.on(AgentEventType.TASK_COMPLETED, event => {
    notif.showTaskCompleted(event.message);
    sysNotif.notifyCompletion(event.message);
    sound.playTaskComplete();
  });

  // 3. Start transport
  const config    = vscode.workspace.getConfiguration('agentNotifier');
  const transport = TransportFactory.create(config);
  transport.onEvent(event => EventBus.emit(event.type, event));
  await transport.start();

  // 4. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('agentNotifier.simulatePermission', () => {
      EventBus.emit(AgentEventType.PERMISSION_REQUIRED, {
        id: Date.now().toString(),
        type: AgentEventType.PERMISSION_REQUIRED,
        message: 'AI wants to run: npm install',
        timestamp: Date.now(),
      });
    }),
    vscode.commands.registerCommand('agentNotifier.simulateComplete', () => {
      EventBus.emit(AgentEventType.TASK_COMPLETED, {
        id: Date.now().toString(),
        type: AgentEventType.TASK_COMPLETED,
        message: 'AI has finished generating response',
        timestamp: Date.now(),
      });
    }),
    statusBar,
    { dispose: () => transport.stop() }
  );
}

export function deactivate(): void {}
```

---

## 8. 📦 `package.json` Key Config

```json
{
  "name": "ai-agent-notifier",
  "displayName": "AI Agent Notifier",
  "description": "Instant alerts when your AI agent needs attention or completes a task",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "agentNotifier.simulatePermission", "title": "AI Notifier: Simulate Permission Request" },
      { "command": "agentNotifier.simulateComplete",  "title": "AI Notifier: Simulate Task Completed" }
    ],
    "configuration": {
      "title": "AI Agent Notifier",
      "properties": {
        "agentNotifier.transport":     { "type": "string", "enum": ["file","http"], "default": "http" },
        "agentNotifier.httpPort":      { "type": "number", "default": 9001 },
        "agentNotifier.watchFilePath": { "type": "string", "default": "/tmp/agent_event.json" },
        "agentNotifier.soundEnabled":  { "type": "boolean", "default": true }
      }
    }
  },
  "dependencies": {
    "node-notifier": "^10.0.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/node-notifier": "^8.0.5",
    "@types/uuid": "^9.0.0",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0"
  }
}
```

---

## 9. 🗺️ Step-by-Step Implementation Roadmap

### Phase 0: Project Bootstrap (Day 1)
**Goal:** Runnable extension skeleton in VS Code

- [ ] `npm install -g yo generator-code`
- [ ] Run `yo code` → select TypeScript extension
- [ ] Set up `tsconfig.json` with strict mode
- [ ] Configure `.vscode/launch.json` for Extension Host debugging
- [ ] Install dependencies: `node-notifier`, `uuid`
- [ ] Create folder structure as defined above
- [ ] Verify `Hello World` command works in Extension Host debug

**Exit Criteria:** Extension loads in VS Code Extension Host without errors.

---

### Phase 1: Core + Simulator (Days 2–3)
**Goal:** End-to-end flow using simulated events

- [ ] Implement `core/types.ts` and `core/constants.ts`
- [ ] Implement `EventBus.ts` (singleton, typed)
- [ ] Implement `NotificationService.ts` (popup show/wait)
- [ ] Implement `StatusBarService.ts` (status item)
- [ ] Implement `extension.ts` with EventBus wiring
- [ ] Register `simulatePermission` and `simulateComplete` commands
- [ ] Test: Run command → VS Code popup appears → Allow/Deny works

**Exit Criteria:** Both VS Code popup types appear and respond correctly via simulation commands.

---

### Phase 2: Sound System (Days 3–4)
**Goal:** Sound plays on every event

- [ ] Source/create two sound files
- [ ] Place in `sounds/` directory
- [ ] Implement `SoundService.ts` with platform detection
- [ ] Wire sound into `PermissionManager` and task complete handler
- [ ] Add setting: `soundEnabled` → wire into SoundService
- [ ] Test: Sound plays when VS Code is minimized

**Exit Criteria:** Correct sound plays for each event type. Works when VS Code is not in focus.

---

### Phase 3: OS Notifications (Days 4–5)
**Goal:** OS-level notification appears alongside VS Code popup

- [ ] Install and configure `node-notifier`
- [ ] Implement `SystemNotifService.ts`
- [ ] Wire into `PermissionManager` and task complete handler
- [ ] Test: OS notification fires simultaneously with VS Code popup
- [ ] Test: OS notification appears with VS Code minimized

**Exit Criteria:** OS notification visible in notification center on trigger.

---

### Phase 4: Transport — File Watch (Days 5–6)
**Goal:** External agent can trigger events via file

- [ ] Implement `ITransport.ts` interface
- [ ] Implement `FileWatchTransport.ts`
- [ ] Implement `EventValidator.ts`
- [ ] Implement `TransportFactory.ts`
- [ ] Wire transport → EventBus in `extension.ts`
- [ ] Test: Write JSON to watched file → event triggers in extension

**Exit Criteria:** Writing `{"type":"permission_required","message":"test"}` to the watch file triggers full notification flow.

---

### Phase 5: Transport — HTTP Server (Days 7–8)
**Goal:** AI agents can POST events to the extension

- [ ] Implement `HttpTransport.ts`
- [ ] Add port config to `package.json` settings
- [ ] Implement `ResponseDispatcher.ts` with HTTP response target
- [ ] Test: `curl -X POST localhost:9001/event -d '{"type":"task_completed","message":"Done!"}'`
- [ ] Test Allow/Deny response being sent back to caller

**Exit Criteria:** Full round-trip — POST → popup → Allow → response delivered.

---

### Phase 6: Polish & Robustness (Days 8–10)
**Goal:** Production-grade reliability

- [ ] Add error boundary around all async flows
- [ ] Implement retry logic for dispatcher
- [ ] Add logging service with configurable verbosity
- [ ] Handle VSIX packaging, test install from `.vsix`
- [ ] Test: Multiple simultaneous permission requests handled correctly
- [ ] Test: All edge cases (missing message, unknown type, port conflict)

**Exit Criteria:** Extension handles all error cases gracefully. No crashes under edge conditions.

---

## 10. ⚠️ Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sound fails silently on Linux | Medium | Medium | Fallback chain: `aplay → paplay → skip`. Log warning. |
| macOS notification permissions denied | Medium | High | Show in-editor notice: "Grant permissions in System Settings" |
| Port 9001 already in use | Medium | High | Auto-retry on next available port; surface port in status bar tooltip |
| `fs.watch` doesn't trigger on all OSes | Low | High | Use `fs.watchFile` polling as fallback |
| Multiple simultaneous permission events | Medium | Medium | PermissionManager queue; status bar shows count |
| User dismisses popup without choosing | High | High | Default-deny on dismiss. Always safe. |
| Extension host crash loses pending responses | Low | Critical | Persist pending IDs to workspace state; retry on reload |
| `node-notifier` native binary issues | Low | Medium | Bundle pre-built binaries; fallback to VS Code-only notification |

---

## 11. 🚀 Production-Readiness Checklist (Post-MVP)

### Security
- [ ] Validate and sanitize all incoming event payloads
- [ ] Bind HTTP server to `127.0.0.1` only (never external interfaces)
- [ ] Add optional API token auth for HTTP endpoint
- [ ] Rate-limit incoming events (max N events/second)

### Reliability
- [ ] Persist pending permission queue to VS Code `globalState`
- [ ] Add heartbeat mechanism to detect dead agents
- [ ] Implement exponential backoff for response delivery failures

### Observability
- [ ] Structured logging to VS Code output channel
- [ ] Telemetry hook (opt-in) for event latency measurement
- [ ] Event history panel (last N events with timestamps)

### Extensibility
- [ ] Plugin-style event handler registry
- [ ] WebSocket transport for real-time bidirectional flow
- [ ] Configuration UI panel

### UX
- [ ] Keyboard shortcut to respond Allow/Deny quickly
- [ ] Quick Pick menu showing all pending permissions
- [ ] Notification history in sidebar panel
- [ ] User-configurable sound files

---

## 12. 🧪 Testing Strategy

### Unit Tests
- `EventBus`: emit/subscribe, singleton behavior
- `EventValidator`: valid/invalid payloads
- `PermissionManager`: queue logic, default-deny on dismiss
- `SoundService`: platform command generation

### Integration Tests
- FileWatchTransport: write file → event received
- HttpTransport: POST request → event emits → response returned

### Manual QA Checklist
- [ ] Popup appears in <100ms of event
- [ ] Sound plays with VS Code minimized
- [ ] OS notification appears
- [ ] Deny response sent correctly
- [ ] Status bar count increments/decrements correctly
- [ ] Multiple simultaneous requests work

---

## 13. 📋 Build Priority Order

| Priority | File | Why |
|----------|------|-----|
| 1 | `core/types.ts` | Defines all data shapes — every other file depends on this |
| 2 | `core/EventBus.ts` | The backbone — all flow passes through here |
| 3 | `services/NotificationService.ts` | First visible output — confirms popups work |
| 4 | `services/StatusBarService.ts` | Sets up the persistent UI state indicator |
| 5 | `services/PermissionManager.ts` | Full permission flow |
| 6 | `services/SoundService.ts` | Sound — high user impact, test early |
| 7 | `services/SystemNotifService.ts` | OS notifications |
| 8 | `transport/FileWatchTransport.ts` | First external trigger |
| 9 | `transport/HttpTransport.ts` | Production trigger |
| 10 | `services/ResponseDispatcher.ts` | Full round-trip |

---

*Plan written: April 2026 | Target: MVP in 10 development days*
