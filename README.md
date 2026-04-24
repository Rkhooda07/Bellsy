# AI Agent Notifier

AI Agent Notifier is a VS Code extension for one job: **tell you when a local coding agent needs attention**.

It is designed for workflows where Codex, Claude Code, Cursor hooks, or any local script can send a small event to VS Code and get back a fast approval signal.

## What It Does

- Shows in-editor permission prompts with `Allow` and `Deny`
- Sends OS notifications for permission requests and task completion
- Plays optional sounds for high-signal events
- Keeps pending approvals visible in the status bar
- Accepts events over loopback HTTP or file-watch transport
- Returns permission responses over HTTP or a response file

## Best Fit

This extension is for:

- local coding-agent workflows
- long-running CLI tools
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
- `AI Notifier: Simulate Permission Request`
- `AI Notifier: Simulate Task Completed`
- `AI Notifier: Show Pending Requests`

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

The packaged CLI wrapper can also run agent commands and detect common terminal prompts:

```bash
pingly-run --agent claude -- claude "fix the failing tests"
pingly-run --agent codex -- codex run
```

The wrapper mirrors stdout/stderr, scans the live stream for permission and completion signals, and posts normalized events to the extension over the local HTTP endpoint.

## Security Model

- The HTTP server binds to `127.0.0.1` only.
- There is no remote auth layer because the intended use is same-machine local tooling.
- Do not expose the port outside the local machine.

## Troubleshooting

- If the extension fails to activate, run `AI Notifier: Show Logs`.
- If port `9001` is already in use, change `agentNotifier.httpPort`.
- If OS notifications do not appear, check your OS notification permissions for VS Code, Cursor, or VSCodium.
- If sounds do not play on Linux, ensure `paplay` or `aplay` is available.

## Release Status

This is a **preview release** intended for early users running local coding agents.
