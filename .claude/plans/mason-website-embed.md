# Mason Website Embed — Quote Bot

## Goal
Embed the Wallace Exterior quote bot on Wallace-Exterior.com using `@n8n/chat` in **webhook mode** (not the hostedChat URL). This allows:
- Dynamic `initialMessages` fetched per-client from their Google Sheet config
- Custom branding (title, subtitle, logo) without editing the n8n workflow
- Multi-client ready — same pattern for every Kayak client

## Architecture

```
Wallace-Exterior.com (static site or Cloudflare Pages)
  └── /functions/chat-config.ts (or CF Worker)
        ├── Reads client config from DB or n8n endpoint
        └── Returns: { webhookUrl, initialMessages, title, subtitle, logo }

Chat widget on page:
  import { createChat } from '@n8n/chat'
  createChat({
    webhookUrl: config.webhookUrl,  // staging or prod n8n webhook
    initialMessages: config.initialMessages,  // from Google Sheet
    theme: { button: { backgroundColor: config.brandColor } }
  })
```

## What Changes vs Current Setup
- **Stop using** the hostedChat URL (`/webhook/<id>/chat`) for Mason's site
- **Use** the webhook path (`/webhook/<id>`) in webhook mode
- `initialMessages` comes from an API call to CAIAC infra (n8n config endpoint or DB), not hardcoded in the n8n workflow
- The chatTrigger's static `initialMessages` is only for testing the hostedChat URL directly

## n8n Webhook URL (staging)
`https://flows-staging.caiacdigital.com/webhook/0d163f71-3cb1-4100-9719-40ad9080c777/chat`

The embedded widget sends messages to this URL. The hostedChat page at the same base URL is for n8n internal testing only.

## Client Config Endpoint Needed
A lightweight endpoint that returns per-client chat config:

```
GET /webhook/chat-config?client=wallace-exterior
→ {
    webhookUrl: "https://flows.caiacdigital.com/webhook/.../chat",
    initialMessages: ["Hi! I'm the Wallace Exterior Quote Assistant..."],
    title: "Get Your Free Quote",
    subtitle: "Window washing, soft wash, concrete, gutters, dryer vent, Christmas lights",
    logoUrl: "https://..."
  }
```

This can be a simple n8n webhook workflow that reads from `caiac.clients` + the client's Google Sheet config tab, or from a static config JSON in the DB.

## Multi-Client Pattern
Each Kayak client gets:
1. Their own n8n workflow (cloned from the Wallace Exterior template)
2. Their own Google Sheet (pricing + company config)
3. Their own `chat-config` entry in the DB
4. Their embed snippet with their `webhookUrl` — everything else comes from config

## Status
- [ ] Build `[Config] Get Chat Widget Config v1.0.0` n8n webhook (reads client config from DB/sheet)
- [ ] Update Wallace-Exterior.com to embed `@n8n/chat` in webhook mode
- [ ] Wire `initialMessages` + title/subtitle from config endpoint
- [ ] Test end-to-end on staging before deploying to prod
