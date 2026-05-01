# Pingly

Pingly is a local-first notification layer for CLI agents and scripts such as Codex CLI and Claude Code. It notifies you when a run completes, fails, or needs approval, then lets you jump back into your editor quickly.

## What Ships in the Production Flow

- local HTTP listener inside the extension
- `pingly-run` wrapper for local agent processes
- in-editor popup notifications
- system notifications
- bundled completion and permission sounds
- click-to-return behavior back into the editor

The primary workflow is local only. The terminal running the agent and the editor running Pingly must be on the same machine or local network namespace.

## Quick Start

1. Install Pingly in Cursor, VS Code, or another VS Code-compatible editor.
2. Run `Pingly: Setup Local Agent Notifications`.
3. Copy one of the wrapper commands:

```bash
pingly-run --agent codex -- codex
```

```bash
pingly-run --agent claude-code -- claude
```

4. Run `Pingly: Test Local Notifications`.
5. Start your real agent run through `pingly-run`.

## Public Commands

- `Pingly: Setup Local Agent Notifications`
- `Pingly: Test Local Notifications`
- `Pingly: Show Logs`

Pending approval requests remain accessible from the status bar and reminder prompts instead of adding extra command-palette clutter.

## Local Event Endpoint

Pingly listens on a loopback HTTP endpoint:

```text
http://127.0.0.1:9001/event
```

If port `9001` is busy, Pingly automatically falls back to another free local port. The setup command and status bar always reflect the live endpoint for the current editor session.

Example completion event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"task_completed","message":"Local agent finished"}'
```

Example failure event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"attention_required","message":"Local agent failed"}'
```

Example approval event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"permission_required","message":"Local agent needs approval"}'
```

## Codex Support

Interactive Codex runs go beyond process exit detection:

- response completion is detected from Codex session JSONL `task_complete` events
- approval prompts are detected from `exec_command` calls that request escalated sandbox permissions
- stale session events from before the current wrapper run are ignored

This is what makes completion and approval notifications reliable for interactive Codex sessions.

## Settings

- `agentNotifier.httpPort`
- `agentNotifier.soundEnabled`
- `agentNotifier.soundVolume`
- `agentNotifier.httpResponseTimeoutMs`
- `agentNotifier.permissionReminderEnabled`
- `agentNotifier.permissionReminderIntervalSeconds`

## Troubleshooting

- If notifications do not appear, run `Pingly: Show Logs`.
- If local events fail, check the status bar for the live endpoint instead of assuming `9001` is active.
- If approval prompts seem stuck, use the reminder popup or status bar item to reopen the pending request list.
