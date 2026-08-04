# ParadeMatch

Blind music-taste matcher for **Street Parade Zürich, 8 August 2026**, built
for one friend group. Hear 30-second snippets from the real line-up with the
artist hidden, swipe Like/Nope, and get a personal stage timeline + which
Love Mobiles to catch.

The operative project spec is [`docs/PROMPT.md`](docs/PROMPT.md).

## How it works

- `scripts/scrape.mjs` pulls stages, line-up, and love mobiles (with artists
  and set times) from streetparade.com into `data/event.json`. Run
  `npm run scrape` to refresh before the event.
- `scripts/build-catalog.mjs` resolves every artist to top tracks with 30s
  previews — Deezer first, iTunes fallback — into `data/catalog.json`
  (`npm run catalog`). Ambiguous one-word artist names are excluded from the
  swipe deck (a namesake's music would poison the blind test) unless the
  event bills them as headliners; they still appear in schedules.
- Preview URLs expire, so `/api/preview` re-resolves them from the stored
  track IDs at play time.
- Votes live in `localStorage`; scoring ranks artists (direct votes strong,
  genre affinity for everyone else) and assembles a half-hour-resolution
  timeline across the fixed stages plus a ranked love-mobile list.

## Develop

```bash
npm install
npm run dev
```

## Deploy (Vercel)

Framework preset **Next.js**, root directory `./`, default build command and
output, **no environment variables**. Deploys on merge to `main`.
