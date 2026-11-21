# Optional card sync

The study app stores cards in IndexedDB on the phone. Sync is off until Settings has an https URL and a secret. Nothing here has to be deployed for flashcards to work.

Recommendation: a Cloudflare Worker plus D1. The free tier covers one person (100,000 D1 rows/day, and a Worker on the free plan). There is no user account. The phone sends `Authorization: Bearer <secret>`, and the secret is the only key. Anyone with the secret can read the cards, so treat it like a password. Last write wins per card.

## Deploy

From this directory, with a Cloudflare account and Wrangler (`npm install -g wrangler`, then `wrangler login`):

```bash
wrangler d1 create laoshi
```

Copy the printed `database_id` into `wrangler.toml`, replacing `replace-after-wrangler-d1-create`.

```bash
wrangler d1 execute laoshi --remote --file=schema.sql
wrangler secret put SYNC_SECRET
wrangler deploy
```

`wrangler deploy` prints an https URL. In the app, open Settings, set the sync URL to that origin (for example `https://laoshi-sync.<account>.workers.dev`), paste the same secret (8 characters or more), and tap Sync now. The client posts to `/sync` on that origin.

To move phones without Cloudflare, use Export on the old phone and Import on the new one. The file is JSON named `laoshi-backup-….json`.

## What is stored

`cards.data` is the scheduler record (stability, difficulty, due time, reps). `devices.settings` is display and pack choices, without the sync secret. `studied_days` is the list of `YYYY-MM-DD` strings used for the streak.
