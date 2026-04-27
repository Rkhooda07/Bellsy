# Integration Examples

These examples are meant to shorten setup for local coding-agent workflows.

## Files

- `send-event.js`: generic local sender for HTTP transport
- `codex-hook.example.sh`: shell example for Codex-style workflows
- `claude-code-hook.example.sh`: shell example for Claude Code-style workflows

## Generic Sender

```bash
node examples/send-event.js task_completed "Codex finished writing tests"
node examples/send-event.js permission_required "Codex wants to run npm install"
```

Environment variables:

- `PINGLY_URL`: override the default `http://127.0.0.1:9001/event`
- `PINGLY_TOOL`: optional metadata tag added to the payload

## Hook Examples

The shell examples are templates. Adapt them to the hook mechanism your agent exposes.

- Use HTTP transport when you want synchronous allow or deny responses.
- Cursor background agents can target `/cursor/webhook`, but they need a public HTTPS URL or tunnel to reach your local extension.
- Use file transport when your local workflow is simpler and polling a response file is acceptable.
- Current release support is based on explicit events from hooks or scripts, not generic CLI interception.
