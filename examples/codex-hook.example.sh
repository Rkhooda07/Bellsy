#!/usr/bin/env bash
set -euo pipefail

EVENT_TYPE="${1:-task_completed}"
MESSAGE="${2:-Codex finished work}"

PINGLY_TOOL=codex node examples/send-event.js "$EVENT_TYPE" "$MESSAGE"
