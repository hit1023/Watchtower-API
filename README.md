# Watchtower API

Watchtower turns meaningful webpage changes into structured events. Version 0.1 runs on Cloudflare Workers, stores watches and snapshots in D1, and can optionally use Workers AI to classify changes.

## Live services

- Dashboard: [watchtower.s-quad.com](https://watchtower.s-quad.com)
- API documentation: [watchtower.s-quad.com/docs/](https://watchtower.s-quad.com/docs/)
- API: [watchtower-api.s-quad.com](https://watchtower-api.s-quad.com)

Both custom domains are served by Cloudflare with HTTPS. The dashboard keeps the API key in `sessionStorage`, so it is removed when the browser session ends.

## What works

- Register a URL with a natural-language monitoring instruction.
- Run a watch immediately or every 15 minutes through a Cron Trigger.
- Normalize HTML, JSON, and plain text before comparison.
- Store snapshots, execution history, and meaningful-change events in D1.
- Reject local/private URL targets, cap response sizes, validate redirects, and time out slow origins.
- Use deterministic change analysis by default; opt into Workers AI with `AI_ENABLED=true`.

## Local setup

```bash
npm install
npm run types
npm run db:migrate:local
npm run dev
```

Authentication is bypassed without `WATCHTOWER_API_KEY` only for requests whose hostname is `localhost` or `127.0.0.1` while `APP_ENV=development`. Deployed URLs still require the secret. To test authentication locally, copy `.dev.vars.example` to `.dev.vars` and set a secret of at least 24 characters.

Create and run a watch:

```bash
curl -X POST http://localhost:8787/v1/watches \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://developers.cloudflare.com/changelog/",
    "instruction": "Detect product launches, pricing changes, deprecations, and breaking API changes.",
    "interval_minutes": 60,
    "importance_threshold": 0.7
  }'

curl -X POST http://localhost:8787/v1/watches/WATCH_ID/run
curl http://localhost:8787/v1/events
```

If a key is configured, add `-H 'Authorization: Bearer YOUR_KEY'`.

## Cloudflare deployment

The production Worker and APAC D1 database are provisioned. For subsequent releases:

1. Authenticate with `npx wrangler login`.
2. Apply any new migrations with `npm run db:migrate:remote`.
3. Validate with `npm run check`.
4. Deploy with `npm run deploy`.

Deploy the dashboard and documentation separately with:

```bash
npm run check:frontend
npm run deploy:frontend
```

The API and static frontend use separate Workers. Their custom domains are declared in `wrangler.jsonc` and `wrangler.frontend.jsonc`; Cloudflare manages the DNS records and certificates.

The production `WATCHTOWER_API_KEY` is stored as a Cloudflare Secret. Rotate it with `npx wrangler secret put WATCHTOWER_API_KEY`.

For production, place the Worker behind Cloudflare Access as an additional authentication layer.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health |
| `POST` | `/v1/watches` | Create a watch |
| `GET` | `/v1/watches` | List watches |
| `GET` | `/v1/watches/:id` | Get one watch |
| `POST` | `/v1/watches/:id/run` | Run immediately |
| `GET` | `/v1/events` | List meaningful changes |

## Current boundary

Version 0.1 stores bounded normalized text in D1. R2 snapshots, Browser Run fallback, webhooks, AI Search, and MCP are intentionally reserved for the next iterations after the core detector is proven.
