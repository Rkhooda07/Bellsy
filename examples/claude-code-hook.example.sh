#!/usr/bin/env bash
set -euo pipefail

EVENT_TYPE="${1:-permission_required}"
MESSAGE="${2:-Claude Code wants approval}"

PINGLY_TOOL=claude-code node examples/send-event.js "$EVENT_TYPE" "$MESSAGE"
