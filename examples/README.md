# Integration Examples

These examples are meant to shorten setup for local coding-agent workflows.

## Files

- `send-event.js`: generic local sender for HTTP transport
- `codex-hook.example.sh`: shell example for Codex-style workflows
- `claude-code-hook.example.sh`: shell example for Claude Code-style workflows

## CLI Wrapper

After installing the extension package locally, use `pingly-run` to wrap a CLI agent:

```bash
pingly-run --agent claude -- claude "fix the failing tests"
pingly-run --agent codex -- codex run
```

The wrapper:

- streams stdout and stderr back to your terminal immediately
- detects common permission prompts such as `[y/N]` and `Do you want to proceed?`
- detects common completion phrases and successful process exits
- sends normalized events to `http://127.0.0.1:9001/event`
- writes `y` or `n` back to the child process when the extension returns Allow or Deny

Options:

```bash
pingly-run \
  --agent claude \
  --endpoint http://127.0.0.1:9001/event \
  --allow-input "y\n" \
  --deny-input "n\n" \
  -- claude "run tests"
```

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
- Use file transport when your local workflow is simpler and polling a response file is acceptable.
