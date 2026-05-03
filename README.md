# Bellsy

Bellsy is a local-first notification layer for CLI agents and scripts such as Codex CLI and Claude Code. It notifies you when a run completes, fails, or needs approval, then lets you jump back into your editor quickly.

## What Ships in the Production Flow

- local HTTP listener inside the extension
- `bellsy-run` wrapper for local agent processes
- in-editor popup notifications
- system notifications
- bundled completion and permission sounds
- click-to-return behavior back into the editor

The primary workflow is local only. The terminal running the agent and the editor running Bellsy must be on the same machine or local network namespace.

## Quick Start

1. Install Bellsy in Cursor, VS Code, or another VS Code-compatible editor.
2. Run `Bellsy: Setup Local Agent Notifications`.
3. Copy one of the wrapper commands:

```bash
bellsy-run codex
```

```bash
bellsy-run claude
```

4. Run `Bellsy: Test Local Notifications`.
5. Start your real agent run through `bellsy-run`.

## Public Commands

- `Bellsy: Setup Local Agent Notifications`
- `Bellsy: Test Local Notifications`
- `Bellsy: Show Logs`
- `Bellsy: Toggle Sound Mode`

Pending approval requests remain accessible from the status bar and reminder prompts instead of adding extra command-palette clutter.

## Local Event Endpoint

Bellsy listens on a loopback HTTP endpoint:

```text
http://127.0.0.1:9001/event
```

If port `9001` is busy, Bellsy automatically falls back to another free local port. The setup command and status bar always reflect the live endpoint for the current editor session.

## Settings

- `bellsy.soundMode`
- `bellsy.httpPort`
- `bellsy.soundEnabled`
- `bellsy.soundVolume`
- `bellsy.httpResponseTimeoutMs`
- `bellsy.permissionReminderEnabled`
- `bellsy.permissionReminderIntervalSeconds`

## Troubleshooting

- If notifications do not appear, run `Bellsy: Show Logs`.
- If local events fail, check the status bar for the live endpoint instead of assuming `9001` is active.
- If approval prompts seem stuck, use the reminder popup or status bar item to reopen the pending request list.
