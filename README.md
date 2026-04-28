# Cursor Agent Notifier

Cursor Agent Notifier is a Cursor-compatible extension focused on one job: **notify you when a Cursor background agent finishes work or needs attention**.

This release is intentionally narrow. It is built around Cursor's documented background-agent webhook flow, not around unsupported scraping of Cursor's foreground chat UI.

## What It Does

- Shows a visible in-editor completion popup when a Cursor background agent finishes
- Shows a stronger in-editor attention popup when a Cursor background agent errors
- Sends OS notifications for both states
- Plays platform-appropriate sounds
- Keeps a built-in self-test so users can verify notifications immediately

## What It Supports In This Release

- Cursor background-agent `FINISHED` -> completion notification
- Cursor background-agent `ERROR` -> strong attention notification
- Explicit local HTTP events if you want to integrate your own scripts or tools
- File transport for local request/response workflows

## What It Does Not Support

- Automatic detection of normal Cursor Composer/chat replies
- Automatic detection of Cursor permission prompts from the foreground agent UI
- Generic interception of arbitrary terminal agents

## Commands

- `Cursor Agent Notifier: Run Self Test`
- `Cursor Agent Notifier: Setup Cursor Webhook`
- `Cursor Agent Notifier: Test Cursor Webhook`
- `Cursor Agent Notifier: Show Logs`
- `Cursor Agent Notifier: Show Pending Requests`

## Quick Start

1. Install the extension in Cursor.
2. Run `Cursor Agent Notifier: Run Self Test`.
3. Confirm that you get:
   - a Cursor popup
   - a system notification
   - the correct sound
4. Run `Cursor Agent Notifier: Setup Cursor Webhook`.
5. Copy the generated secret.
6. Run `Cursor Agent Notifier: Test Cursor Webhook` and verify both:
   - `Finished` -> completion notification
   - `Error` -> strong attention notification
7. Expose the local webhook endpoint through any HTTPS tunnel.
8. Paste the public webhook URL and the copied secret into Cursor background-agent webhook settings.

Local endpoint used by the extension:

```text
http://127.0.0.1:9001/cursor/webhook
```

Important:

- Cursor background-agent webhooks come from Cursor's cloud, so they cannot call `127.0.0.1` directly.
- You must point Cursor at a public HTTPS URL that forwards to your local `/cursor/webhook` endpoint.
- The built-in webhook test verifies the local Cursor webhook route before you connect a real background agent.

## Cursor Mapping

- `FINISHED` -> `task_completed`
- `ERROR` -> `attention_required`

This is the clean, documented Cursor integration path. Cursor's current webhook API does not send interactive Allow/Deny permission requests.

## Settings

- `agentNotifier.httpPort`
  The local loopback port used by the extension.

- `agentNotifier.cursorWebhookSecret`
  The HMAC secret used to verify Cursor background-agent webhooks. Use the same secret in Cursor.

- `agentNotifier.soundEnabled`
  Enables notification sounds.

- `agentNotifier.soundVolume`
  Preferred playback volume where supported.

## Explicit HTTP Events

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

Permission example for custom local workflows:

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

- If the extension does not activate, run `Cursor Agent Notifier: Show Logs`.
- If `Cursor Agent Notifier: Test Cursor Webhook` works but real Cursor background-agent notifications do not arrive, the webhook URL is not reaching your local machine yet.
- If port `9001` is already in use, change `agentNotifier.httpPort`.
- If notifications do not appear, check Cursor notification permissions in your OS.

## Release Status

This is a **preview** release focused on Cursor background-agent notifications.
