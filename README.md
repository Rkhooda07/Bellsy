# AI Agent Notifier

AI Agent Notifier is a VS Code extension that surfaces high-signal agent events with:

- in-editor notifications
- OS notifications
- notification sounds
- a pending-request status bar indicator
- file-watch and loopback HTTP transports

## MVP Features

- `permission_required` events prompt for `Allow` or `Deny`
- `task_completed` events fire completion notifications
- simulator commands for local testing
- HTTP round-trip responses for permission prompts
- file watcher mode for simple local integrations

## Development

```bash
npm install
npm run build
```

Launch the Extension Host with `.vscode/launch.json`.

## Commands

- `AI Notifier: Simulate Permission Request`
- `AI Notifier: Simulate Task Completed`
- `AI Notifier: Show Pending Requests`

## HTTP Transport

Default port: `9001`

Permission request example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"permission_required","message":"AI wants to run npm install"}'
```

Completion event example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"task_completed","message":"AI finished generating a response"}'
```

## File Transport

Set `agentNotifier.transport` to `file`, then write JSON to the configured watch path.

Example:

```json
{
  "type": "permission_required",
  "message": "AI wants to edit package.json"
}
```
