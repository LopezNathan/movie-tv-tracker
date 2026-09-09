# Cloudflare deployment

Scene is configured for Cloudflare Workers, D1, and Access. These steps intentionally require an operator; the repository contains no account IDs, tokens, or production database identifiers.

## 1. Prerequisites

- Node.js 22 or newer
- A Cloudflare account with Workers and Zero Trust enabled
- A TMDB API read-access token from a personal, non-commercial TMDB developer account
- Wrangler authenticated locally with `npx wrangler login`

## 2. Create and configure D1

Create the database:

```sh
npx wrangler d1 create movie-tv-tracker
```

Copy the returned `database_id` into the `d1_databases` entry in `wrangler.jsonc`, replacing the all-zero placeholder. Do not put credentials in that file.

Apply the schema:

```sh
npm run db:migrate:remote
```

## 3. Add the TMDB secret

```sh
npx wrangler secret put TMDB_API_TOKEN
```

Paste the TMDB API read-access token at the prompt. Keep `.dev.vars` local for development; it is ignored by Git.

## 4. Deploy to workers.dev

Review the production build, then deploy:

```sh
npm run check
npm run deploy
```

Wrangler prints the resulting `https://movie-tv-tracker.<subdomain>.workers.dev` address. The project does not create or alter a custom domain.

## 5. Protect the application with Cloudflare Access

Before adding personal data, open Cloudflare Zero Trust and create a self-hosted Access application for the exact workers.dev hostname.

1. Add a policy whose action is **Allow**.
2. Include only the email address that should own this library.
3. Set the session duration you prefer and save the application.
4. Copy the application **AUD tag** into `CF_ACCESS_AUD` in `wrangler.jsonc`.
5. Replace `CF_ACCESS_TEAM_DOMAIN` with your Zero Trust team domain (for example, `your-team.cloudflareaccess.com`).
6. Deploy again, then open the workers.dev address in a private browser window and confirm that Access challenges before Scene loads.

The Worker validates Cloudflare's signed `Cf-Access-Jwt-Assertion` and uses the stable Access subject as `user_id`. `DEV_USER_EMAIL` is accepted only when `ENVIRONMENT=development`; never set that variable in production.

## 6. Verify and operate

After Access succeeds:

- Open `/api/health` and confirm `{"ok":true,"environment":"production"}`.
- Search for one title to verify TMDB access.
- Add and remove it from the watchlist to verify D1 writes.
- Install the PWA and revisit the dashboard offline to verify cached read-only data.
- Use Settings → Download JSON periodically for a portable backup.

To deploy a new version, pull the reviewed source, run `npm ci`, `npm run check`, and `npm run deploy`. Database changes must be applied with `npm run db:migrate:remote` before code that depends on them.

## Security notes

- Never commit `.dev.vars`, `.env` files, Wrangler state, D1 files, TMDB tokens, or Trakt exports.
- Mutations, search, and imports require a live network connection and are not queued by the service worker.
- The PWA caches only the app shell, TMDB artwork, and successful reads for dashboard/history/library/media endpoints. Settings can clear those device-local caches.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
