#!/usr/bin/env bash
set -euo pipefail

EVENT_TYPE="${1:-task_completed}"
MESSAGE="${2:-Claude Code finished work}"

PINGLY_TOOL=claude-code node examples/send-event.js "$EVENT_TYPE" "$MESSAGE"
