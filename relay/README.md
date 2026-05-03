# Bellsy Relay

This package contains the optional hosted relay for experimental Cursor cloud-agent notifications.

It is no longer the primary Bellsy workflow. The main product path is local-agent notifications through `bellsy-run`, direct local HTTP events, and tool hooks.

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
"bellsy.relayBaseUrl": "https://your-relay.example.workers.dev"
```
