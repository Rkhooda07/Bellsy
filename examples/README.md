# Integration Examples

These examples are meant to shorten setup for local coding-agent workflows around Bellsy.

## Files

- `send-event.js`: generic local sender for HTTP transport
- `codex-hook.example.sh`: shell example for Codex-style workflows
- `claude-code-hook.example.sh`: shell example for Claude Code-style workflows

## Lowest-Fuss Path

The easiest setup is the wrapper command:

```bash
bellsy-run claude
bellsy-run codex
bellsy-run your-command-here
```

That path gives you:

- completion notifications on success
- attention notifications on non-zero exit or failure text
- approval prompts when interactive confirmation patterns are detected

## Generic Sender

```bash
node examples/send-event.js task_completed "Codex finished writing tests"
node examples/send-event.js attention_required "Codex run failed"
node examples/send-event.js permission_required "Claude Code wants approval"
```

Environment variables:

- `BELLSY_URL`: override the default `http://127.0.0.1:9001/event`
- `BELLSY_TOOL`: optional metadata tag added to the payload

## Hook Examples

The shell examples are templates. Adapt them to the hook mechanism your tool exposes.

- Use HTTP transport when you want synchronous allow or deny responses.
- Use `bellsy-run` when you want the least setup and broadest compatibility.
- Use native hooks when the tool already gives you a clean pre/post action surface.
- Use file transport only for advanced local workflows that prefer file polling over HTTP.
