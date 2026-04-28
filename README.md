# Cursor Agent Notifier

Cursor Agent Notifier is a Cursor-compatible extension that notifies you when a Cursor background agent finishes work or needs attention.

## Hosted Relay Flow

The default Cursor flow is now hosted relay mode:

1. Install the extension in Cursor.
2. Configure `agentNotifier.relayBaseUrl` to your deployed relay URL.
3. Run `Cursor Agent Notifier: Run Self Test`.
4. Run `Cursor Agent Notifier: Setup Cursor Webhook`.
5. Copy the hosted webhook URL and webhook secret.
6. Paste both into Cursor background-agent webhook settings once.
7. Run `Cursor Agent Notifier: Test Cursor Webhook`.

After that, Cursor sends `FINISHED` and `ERROR` events to the relay, and the relay forwards normalized events to the connected extension.

## What It Does

- Shows an in-editor completion popup when a Cursor background agent finishes
- Shows a stronger in-editor attention popup when a Cursor background agent errors
- Sends OS notifications for both states
- Plays platform-appropriate sounds
- Keeps built-in self-test and hosted webhook test commands

## Commands

- `Cursor Agent Notifier: Run Self Test`
- `Cursor Agent Notifier: Setup Cursor Webhook`
- `Cursor Agent Notifier: Test Cursor Webhook`
- `Cursor Agent Notifier: Show Logs`
- `Cursor Agent Notifier: Show Pending Requests`

## Cursor Mapping

- `FINISHED` -> `task_completed`
- `ERROR` -> `attention_required`

Only Cursor background-agent status webhooks are handled in relay mode. Foreground Composer/chat events and permission-request flows are intentionally out of scope.

## Relay Deployment

The hosted relay lives in [relay](./relay) and targets Cloudflare Workers plus Durable Objects.

Expected endpoints:

- `POST /v1/installs/register`
- `POST /v1/installs/restore`
- `GET /v1/connect/:installId`
- `POST /v1/webhooks/cursor/:installId`
- `POST /v1/installs/:installId/rotate-secret`

Before packaging the extension for real use, deploy the Worker and set:

```json
"agentNotifier.relayBaseUrl": "https://your-relay.example.workers.dev"
```

The extension stores relay install credentials in `globalState`, not in user settings.

## Settings

- `agentNotifier.relayBaseUrl`
  Base URL for the hosted relay. When set, hosted relay mode becomes the default Cursor setup path.

- `agentNotifier.httpPort`
  Local loopback port used by the retained HTTP transport.

- `agentNotifier.cursorWebhookSecret`
  Optional local-only HMAC secret for direct `/cursor/webhook` fallback testing.

- `agentNotifier.soundEnabled`
  Enables notification sounds.

- `agentNotifier.soundVolume`
  Preferred playback volume where supported.

## Explicit Local HTTP Events

The extension still supports direct local HTTP events at:

```text
http://127.0.0.1:9001/event
```

Completion example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"task_completed","message":"Custom tool finished"}'
```

Attention example:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"attention_required","message":"Custom tool needs attention"}'
```

Permission example for local workflows:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H "content-type: application/json" \
  -d '{"type":"permission_required","message":"Local tool wants approval"}'
```

## File Transport

If you prefer file-based local workflows, set:

```json
"agentNotifier.transport": "file"
```

Defaults:

- request file: `/tmp/agent_event.json`
- response file: `/tmp/agent_response.json`

## Troubleshooting

- If activation succeeds but relay setup is unavailable, check `agentNotifier.relayBaseUrl` and `Cursor Agent Notifier: Show Logs`.
- If the hosted webhook test is accepted but no notification appears, the extension is not currently connected to the relay.
- If local HTTP events do not work, check whether port `9001` is already in use.

## Release Status

This is still a preview release focused on Cursor background-agent notifications.
