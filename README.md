# AI Agent Notifier

AI Agent Notifier is a VS Code extension for one job: **tell you when an AI agent needs your attention**.

It is designed for workflows where VS Code, local scripts, or editor-integrated agents can send a small event to VS Code and get back a fast approval signal.

## What Problem It Solves

- Shows in-editor permission prompts with `Allow` and `Deny`
- Sends OS notifications for permission requests and task completion
- Plays optional sounds for high-signal events
- Keeps pending approvals visible in the status bar
- Accepts events over loopback HTTP or file-watch transport
- Returns permission responses over HTTP or a response file

## Best Fit

This extension is for:

- local coding-agent workflows
- editor-integrated agents
- scripts or hooks that can send local HTTP/file events
- AI-assisted development setups where VS Code is open but not always focused

This extension is not trying to be:

- a chat interface
- an AI dashboard
- a telemetry product

## Install And Run

```bash
npm install
npm run build
npm test
npm run package
```

Open the workspace in VS Code and start `Run AI Agent Notifier` from `.vscode/launch.json`.

## Commands

- `AI Notifier: Show Logs`
- `AI Notifier: Run Self Test`
- `AI Notifier: Show Pending Requests`

## How To Test It

1. Install or run the extension in VS Code.
2. Run `AI Notifier: Run Self Test` from the Command Palette.
3. Confirm that you receive:
   a visible VS Code popup,
   a system notification,
   and the platform-appropriate sound.
4. Use the HTTP or file transport examples below to verify a real event path.

## Event Shape

```json
{
  "type": "permission_required",
  "message": "AI wants to run npm install",
  "id": "optional-stable-id",
  "timestamp": 1760000000000,
  "metadata": {
    "tool": "codex"
  }
}
```

Supported event types:

- `permission_required`
- `task_completed`

Optional normalized fields:

- `source`: `vscode`, `cli`, `external_agent`, `file`, `http`, or `simulator`
- `priority`: `high` or `low`
- `agent`: tool name such as `codex`, `claude`, or `copilot`
- `correlationId`: stable run id used to dedupe repeated events

## HTTP Transport

Default endpoint: `http://127.0.0.1:9001/event`

Use this when a script, hook, or external tool can send explicit events to the extension.

Completion event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"task_completed","message":"Codex finished generating a patch"}'
```

Permission request:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"permission_required","message":"Claude Code wants to run npm install"}'
```

If the user responds, the HTTP caller receives:

```json
{
  "status": "responded",
  "eventId": "3fe8d9d4-b8c1-4e31-9f49-61ab730e1b66",
  "allowed": true,
  "respondedAt": 1760000000000
}
```

## File Transport

Use this when a local workflow is simpler with a watched request file and a response file.

Set `agentNotifier.transport` to `file`.

Default paths:

- request file: `/tmp/agent_event.json`
- response file: `/tmp/agent_response.json`

Write an event to the request file:

```json
{
  "type": "permission_required",
  "message": "Codex wants to edit package.json"
}
```

When the user answers a permission request, the extension writes:

```json
{
  "eventId": "3fe8d9d4-b8c1-4e31-9f49-61ab730e1b66",
  "allowed": false,
  "respondedAt": 1760000000000
}
```

## CLI-Agent Helpers

Helper examples live in [the examples guide](https://github.com/Rkhooda07/Pingly/blob/main/examples/README.md).

Included examples:

- generic Node sender
- Codex shell hook example
- Claude Code shell hook example

Current release guidance:

- use explicit HTTP events from scripts, hooks, or external tools
- use file transport when a local workflow is simpler with request/response files
- do not rely on generic terminal interception as a supported feature in this release

## Supported In This Release

- VS Code extension usage
- in-editor permission prompts and completion popups
- system notifications on macOS, Windows, and Linux
- explicit HTTP event delivery
- file-based event delivery
- self-test, logs, and pending request inspection

Not officially supported in this release:

- generic interception of any arbitrary CLI agent terminal session
- agent-specific adapters beyond explicit script or hook integration

## Security Model

- The HTTP server binds to `127.0.0.1` only.
- There is no remote auth layer because the intended use is same-machine local tooling.
- Do not expose the port outside the local machine.

## Troubleshooting

- If the extension fails to activate, run `AI Notifier: Show Logs`.
- Run `AI Notifier: Run Self Test` to verify popup, system notification, and sound behavior.
- If port `9001` is already in use, change `agentNotifier.httpPort`.
- If OS notifications do not appear, check your OS notification permissions for VS Code, Cursor, or VSCodium.
- If sounds do not play on Linux, ensure `paplay` or `aplay` is available.

## Release Status

This is a **preview release** intended for early users running local coding agents.
