# Beast Service Bot MVP

Telegram bot plus Vercel serverless REST API for a local services marketplace MVP backed by Supabase.

## Delivered MVP

- Provider registration with name, phone, location, bio, and supported services
- Manual provider verification flag in Supabase
- Provider search by service plus optional location
- Client request creation tied to a provider and service type
- Request status lookup with `/status <id>`
- Admin bot commands:
  - `/list_providers <password>`
  - `/list_requests <password>`
- Admin API request status update through `PATCH /api/requests`

## Project structure

```text
api/
  clients.js
  health.js
  providers.js
  requests.js
  set-webhook.js
  supabaseClient.js
  telegram-webhook.js
utils/
  sendMessage.js
supabase/
  schema.sql
  seed.sql
```

## Environment variables

```bash
TELEGRAM_BOT_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WEBHOOK_SECRET_TOKEN=
TELEGRAM_WEBHOOK_URL=
ADMIN_PASSWORD=
```

`SUPABASE_SERVICE_ROLE_KEY` is recommended because these server-side functions create and update marketplace records directly.

## Bot commands

- `/start`
- `/help`
- `/services`
- `/register_provider`
- `/search painter`
- `/search painter | bole`
- `/status 12`
- `/list_providers your-admin-password`
- `/list_requests your-admin-password`

## Deploy

1. Create a Supabase project.
2. Open the SQL editor and run [`supabase/schema.sql`](/C:/Users/Computer/Documents/codex/supabase/schema.sql).
3. Optionally run [`supabase/seed.sql`](/C:/Users/Computer/Documents/codex/supabase/seed.sql).
4. Create a Telegram bot with `@BotFather` and copy the token.
5. Import this repo into Vercel.
6. In Vercel, set:
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_SECRET_TOKEN`
   - `ADMIN_PASSWORD`
   - Framework Preset: `Other`
   - Output Directory: leave empty
7. Deploy once so you get the production URL.
8. Set `TELEGRAM_WEBHOOK_URL` to `https://YOUR-PROJECT.vercel.app/api/telegram-webhook`.
9. Redeploy, or add that variable and trigger a new deployment.
10. Register the webhook:

```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/set-webhook
```

11. Test in Telegram:
   - `/services`
   - `/search painter`
   - tap a `Request ...` button
   - complete the prompt sequence
   - `/status <request-id>`

## REST API summary

- `POST /api/clients`
- `GET /api/clients?telegram_id=...`
- `POST /api/providers`
- `GET /api/providers?service=painter&location=bole`
- `POST /api/requests`
- `PATCH /api/requests` with header `x-admin-pass`
- `GET /api/requests` with header `x-admin-pass`
- `POST /api/set-webhook`
- `GET /api/health`

## Example admin update

```bash
curl -X PATCH https://YOUR-PROJECT.vercel.app/api/requests \
  -H "Content-Type: application/json" \
  -H "x-admin-pass: YOUR_ADMIN_PASSWORD" \
  -d "{\"id\":12,\"status\":\"ACCEPTED\"}"
```
