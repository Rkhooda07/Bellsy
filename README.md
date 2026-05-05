# Bellsy

Bellsy tells you when a local coding agent or long-running CLI task needs your attention.

Use it with Codex CLI, Claude Code, scripts, test runs, build commands, or any local process you do not want to babysit. Bellsy runs inside VS Code-compatible editors and sends completion, failure, and approval alerts through editor popups, system notifications, and bundled sounds.

## Why Bellsy?

Local AI agents are useful, but they are easy to lose track of. A task can finish while you are in another app, fail while you are reading docs, or pause on an approval prompt while you assume it is still working.

Bellsy adds the missing attention layer:

- get notified when a local agent finishes
- catch failed runs and obvious error states
- hear approval prompts before the agent sits blocked
- click a system notification to jump back into the editor
- keep the setup local, simple, and editor-friendly

## Works With

- Codex CLI
- Claude Code
- Cursor
- Visual Studio Code
- VS Code-compatible editors
- local scripts, test runners, build commands, and custom tools

Bellsy is local-first. The terminal running your agent and the editor running Bellsy must be on the same machine or the same local network namespace.

## Quick Start

1. Install Bellsy.
2. Open the Command Palette.
3. Run `Bellsy: Setup Local Agent Notifications`.
4. Copy one of the wrapper commands.
5. Run `Bellsy: Test Local Notifications`.
6. Start your agent through `bellsy-run`.

For Codex CLI:

```bash
bellsy-run codex
```

For Claude Code:

```bash
bellsy-run claude
```

For any other command:

```bash
bellsy-run your-command-here
```

If Bellsy has to use a fallback port, the status bar shows the live endpoint. Advanced scripts can still target it with `BELLSY_URL`:

```bash
BELLSY_URL=http://127.0.0.1:PORT/event bellsy-run codex
```

## What You Get

- In-editor notification popups
- Native system notifications
- Bundled completion and permission sounds
- Focus and Vibe sound modes
- Click-to-return behavior from system notifications
- Pending approval reminders
- Local HTTP event endpoint with automatic port fallback
- Codex interactive turn completion through session event parsing
- Codex approval detection from structured permission requests

## Commands

- `Bellsy: Setup Local Agent Notifications`
- `Bellsy: Test Local Notifications`
- `Bellsy: Show Logs`
- `Bellsy: Toggle Sound Mode`

Pending approval requests are available from the status bar and reminder prompts, so the Command Palette stays focused on the main workflow.

## Sound Modes

Bellsy ships with two sound styles:

- `Focus`: clean professional sounds for completion and permission alerts
- `Vibe`: playful sounds for a lighter notification style

Switch anytime with:

```text
Bellsy: Toggle Sound Mode
```

## Local Event Endpoint

Bellsy listens on a loopback HTTP endpoint:

```text
http://127.0.0.1:9001/event
```

If port `9001` is busy, Bellsy automatically chooses another free local port. The setup command and status bar always show the live endpoint for the current editor session.

Example direct event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H 'content-type: application/json' \
  -d '{"type":"task_completed","message":"Local task finished"}'
```

## Settings

- `bellsy.soundMode`
- `bellsy.httpPort`
- `bellsy.soundEnabled`
- `bellsy.soundVolume`
- `bellsy.httpResponseTimeoutMs`
- `bellsy.permissionReminderEnabled`
- `bellsy.permissionReminderIntervalSeconds`

## Troubleshooting

If notifications do not appear, run:

```text
Bellsy: Show Logs
```

If local events fail, check the Bellsy status bar item for the live endpoint instead of assuming port `9001` is active.

If approval prompts seem stuck, use the reminder popup or status bar item to reopen the pending request list.

## Privacy

Bellsy's production workflow is local-first. It listens on loopback, receives local events, and does not require a hosted relay for normal Codex, Claude Code, or script notifications.
