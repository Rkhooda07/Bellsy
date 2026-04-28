# Pingly Relay

This package contains the hosted relay for Cursor background-agent notifications.

## Stack

- Cloudflare Workers for public HTTPS ingress
- Durable Objects for per-install connection state, short-lived queueing, and live WebSocket ownership

## Required Secret

Set a Worker secret before deploy:

```bash
wrangler secret put RELAY_MASTER_SECRET
```

## Endpoints

- `POST /v1/installs/register`
- `POST /v1/installs/restore`
- `GET /v1/connect/:installId`
- `POST /v1/webhooks/cursor/:installId`
- `POST /v1/installs/:installId/rotate-secret`

## Deploy

```bash
cd relay
npm install
npm run deploy
```

After deploy, point the extension at the Worker URL with:

```json
"agentNotifier.relayBaseUrl": "https://your-relay.example.workers.dev"
```
