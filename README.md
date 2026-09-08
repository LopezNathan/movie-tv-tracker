# Scene

A private, installable movie and television tracker. Scene keeps watch history, ratings, watchlists, and episode progress in a Cloudflare D1 database and uses TMDB for catalog metadata.

## Requirements

- Node.js 22 or newer
- A free Cloudflare account for production
- A TMDB API read-access token

## Local development

```sh
npm install
npm run dev
```

The local app is available at `http://localhost:5173`. Additional database, authentication, import, test, and deployment instructions are added alongside those features.

## Commands

```sh
npm run dev          # local Cloudflare/Vite runtime
npm run build        # type-check and production build
npm run lint         # static analysis
npm run test         # unit and integration tests
npm run test:e2e     # Playwright browser tests
npm run check        # all non-browser verification
```

## Privacy

The production Worker is designed to sit behind Cloudflare Access. Secrets, local databases, build output, and personal exports are excluded from Git.
