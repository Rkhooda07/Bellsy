# Pingly

Pingly is a Cursor-compatible extension for **local coding-agent notifications**. It tells you when tools like Claude Code, Codex CLI, shell scripts, and other local agent workflows finish, fail, or need approval.

## Why Use It

Running local agents normally means you have to keep watching the terminal. Pingly adds one thin local notification layer:

- completion notifications when a run succeeds
- stronger attention notifications when a run fails
- approval prompts for interactive confirmation flows
- the same notification behavior across different local tools

## Quick Start

1. Install the extension in Cursor.
2. Run `Pingly: Run Self Test`.
3. Run `Pingly: Setup Local Agent Notifications`.
4. Copy a starter command such as:
   - `pingly-run --agent claude-code -- claude`
   - `pingly-run --agent codex -- codex`
5. Run `Pingly: Test Local Notifications`.
6. Start your local tool through `pingly-run`.

No tunnel, hosted webhook, Cursor Pro plan, or cloud-agent API is required for the primary workflow.

## What It Supports

- local CLI tools launched through `pingly-run`
- direct local HTTP events at `http://127.0.0.1:9001/event`
- approval prompts with allow/deny responses
- shell-script and hook-based integrations for tools that can emit explicit local events

## Commands

- `Pingly: Run Self Test`
- `Pingly: Setup Local Agent Notifications`
- `Pingly: Test Local Notifications`
- `Pingly: Show Logs`
- `Pingly: Show Pending Requests`
- `Pingly: Configure Hosted Relay URL (Experimental)`

## Primary Setup Path

Use the wrapper command:

```bash
pingly-run --agent claude-code -- claude
```

or:

```bash
pingly-run --agent codex -- codex
```

`pingly-run` watches output and process exit state, then emits normalized local events:

- success -> `task_completed`
- non-zero exit / failure signal -> `attention_required`
- confirmation prompt -> `permission_required`

For interactive Codex sessions, Pingly also tails Codex's local session JSONL and sends a completion notification each time Codex finishes a response turn.

## Direct Local HTTP Events

The extension also supports explicit local HTTP events at:

```text
http://127.0.0.1:9001/event
```

Completion example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"task_completed","message":"Local tool finished"}'
```

Attention example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"attention_required","message":"Local tool failed"}'
```

Permission example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"permission_required","message":"Local tool wants approval"}'
```

## Settings

- `agentNotifier.httpPort`
  Local loopback port used by the extension.

- `agentNotifier.soundEnabled`
  Enables notification sounds.

- `agentNotifier.soundVolume`
  Preferred playback volume where supported.

- `agentNotifier.transport`
  Transport used to receive local events. `http` is the recommended default.

- `agentNotifier.relayBaseUrl`
  Optional experimental hosted relay URL for secondary Cursor cloud-agent workflows.

## File Transport

If you prefer file-based local workflows, set:

```json
"agentNotifier.transport": "file"
```

Defaults:

- request file: `/tmp/agent_event.json`
- response file: `/tmp/agent_response.json`

## Experimental Hosted Relay

The old hosted Cursor relay remains in the repo as a secondary/experimental path. It is no longer the primary workflow and may require paid Cursor cloud-agent access.

Relay code and deployment notes live in [relay](./relay).

## Troubleshooting

- If local events do not work, check whether port `9001` is already in use.
- If wrapper runs do not notify, run `Pingly: Show Logs`.
- If approvals do not appear, confirm the tool is emitting recognizable confirmation text or send explicit `permission_required` events.

## Release Status

This is a preview release focused on local coding-agent notifications.
