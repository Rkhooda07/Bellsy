# Bellsy 🔔

![Bellsy Logo](assets/readme-logo.png)

![VS Code](https://img.shields.io/badge/VS%20Code-Extension-2F80ED?style=for-the-badge&logo=visualstudiocode&logoColor=white)
![Local First](https://img.shields.io/badge/Local-First-0F766E?style=for-the-badge)
![Codex + Claude + Cursor](https://img.shields.io/badge/Codex%20%2B%20Claude%20%2B%20Cursor-Supported-111827?style=for-the-badge)

> **Stop babysitting your terminal.**
>
> Bellsy notifies you when local coding agents, scripts, and CLI tasks finish, fail, or need approval.

Perfect for **Codex CLI**, **Claude Code**, **Cursor**, build commands, test runs, and long-running local workflows.

## ✨ Why Bellsy?

Local AI agents are powerful, but easy to lose track of.

You switch tabs, start reading docs, grab coffee... and somewhere in the background your agent:

- ✅ finished successfully
- ❌ failed on an error
- 🙋 paused waiting for approval

Bellsy adds the missing attention layer so you can stay in flow instead of repeatedly checking whether something finished.

## 🚀 What You Get

- 🔔 In-editor notification popups
- 🖥️ Native system notifications
- 🔊 Bundled sounds for completion and approval alerts
- 🎛️ `Focus` and `Vibe` sound modes
- 👆 Click a system notification to jump back into your editor
- ⏳ Pending approval reminders
- 🌐 Local HTTP event endpoint with automatic port fallback
- 🤖 Support for local agent workflows and general CLI commands

## 💡 Best For

- Running Codex or Claude Code while working in another app
- Letting long test runs or build jobs finish in the background
- Catching approval prompts before an agent sits blocked
- Getting back to your editor quickly when work completes

## 🎬 Preview

### Full workflow: start a task and get notified

This preview shows the main Bellsy flow from setup to completion notification.

![Bellsy workflow demo](assets/workflow-demo.gif)

### Extra feature: toggle between sound modes

This preview shows how to switch between `Focus` and `Vibe` sound styles.

![Bellsy sound modes demo](assets/sound-modes-demo.gif)

### Full YouTube demo

> 📺 Add your full walkthrough video link here later.
>
> Suggested section:
> `Watch the full demo on YouTube: [Add link here]`

## 🧠 Works With

- Codex CLI
- Claude Code
- Cursor
- Visual Studio Code
- VS Code-compatible editors
- Local scripts, test runners, build commands, and custom tools

Bellsy is local-first. The terminal running your agent and the editor running Bellsy should be on the same machine, or at least within the same local network namespace.

## 🧩 Typical Flow

1. Start Bellsy setup from the Command Palette.
2. Wrap your agent or CLI command with `bellsy-run`.
3. Switch tabs and keep working.
4. Bellsy alerts you when the task completes, fails, or needs approval.

## ⚡ Quick Start

1. Install Bellsy.
2. Open the Command Palette.
3. Run `Bellsy: Setup Local Agent Notifications`.
4. Copy one of the generated wrapper commands.
5. Run `Bellsy: Test Local Notifications`.
6. Start your agent or command through `bellsy-run`.

For Codex CLI:

```bash
bellsy-run codex
```

For Claude Code:

```bash
bellsy-run claude
```

For any other command:

```bash
bellsy-run your-command-here
```

If Bellsy has to use a fallback port, the status bar shows the live endpoint. Advanced scripts can still target it with `BELLSY_URL`:

```bash
BELLSY_URL=http://127.0.0.1:PORT/event bellsy-run codex
```

## 🕹️ Commands

- `Bellsy: Setup Local Agent Notifications`
- `Bellsy: Test Local Notifications`
- `Bellsy: Show Logs`
- `Bellsy: Toggle Sound Mode`

Pending approval requests are intentionally surfaced through reminder prompts and the status bar, so the Command Palette stays clean and focused.

## 🔊 Sound Modes

Bellsy ships with two sound styles:

- `Focus`: clean, professional sounds for work mode
- `Vibe`: more playful sounds for a lighter workflow

Switch anytime with:

```text
Bellsy: Toggle Sound Mode
```

## 🌐 Local Event Endpoint

Bellsy listens on a local loopback HTTP endpoint:

```text
http://127.0.0.1:9001/event
```

If port `9001` is busy, Bellsy automatically picks another free local port. The setup command and status bar always show the active endpoint for the current editor session.

Example direct event:

```bash
curl -X POST http://127.0.0.1:9001/event \
  -H 'content-type: application/json' \
  -d '{"type":"task_completed","message":"Local task finished"}'
```

## ⚙️ Settings

- `bellsy.soundMode`
- `bellsy.httpPort`
- `bellsy.soundEnabled`
- `bellsy.soundVolume`
- `bellsy.httpResponseTimeoutMs`
- `bellsy.permissionReminderEnabled`
- `bellsy.permissionReminderIntervalSeconds`

## 🛠️ Troubleshooting

If notifications do not appear, run:

```text
Bellsy: Show Logs
```

If local events fail, check the Bellsy status bar item for the live endpoint instead of assuming port `9001` is active.

If approval prompts seem stuck, use the reminder popup or status bar item to reopen the pending request list.

## 🔒 Privacy

Bellsy's production workflow is local-first. It listens on loopback, receives local events locally, and does not require a hosted relay for normal Codex, Claude Code, or script notifications.
