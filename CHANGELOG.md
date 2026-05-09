# Changelog

## 0.2.1

- Fixed Gemini CLI completion notifications by installing a local Gemini `AfterAgent` hook from `bellsy-run gemini`.
- Hardened standalone CLI startup so Bellsy verifies the local server before posting events.
- Added a Bellsy HTTP health endpoint for release checks and safer port handling.
- Removed the direct `uuid` runtime dependency in favor of Node's built-in UUID support.
- Updated npm package metadata, release scripts, and README guidance for the global CLI package.

## 0.2.0

- Renamed the extension and public surface to Bellsy.
- Finalized the local-first notification flow for Codex CLI, Claude Code, and local scripts.
- Added the `bellsy-run` wrapper with shorter setup commands.
- Added selectable focus and vibe sound modes with bundled completion and permission sounds.
- Added port fallback, click-to-return behavior, log access, and production packaging cleanup.
