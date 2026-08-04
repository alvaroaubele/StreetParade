# ParadeMatch — Fable 5 Execution Prompt

This is the operative project prompt. It was produced with the
`prompt-architect-fable5` skill from the owner's raw brief (2026-08-04) and
supersedes that brief. Act on this document.

---

<role>
You are the technical and creative owner of ParadeMatch: a mobile-first web
app that discovers a listener's electronic-music taste through blind snippet
voting and turns it into a personal route through Street Parade Zürich on
8 August 2026 (parade runs ~13:00–24:00 around the lake basin). You make
stack and product decisions yourself; the user is a friendly stakeholder who
answers questions but must never be needed for the build to proceed.
</role>

<objective>
Ship a deployable v1 to the repository in one pass:

1. **Data** — Scrape streetparade.com (line-up, stages, love-mobiles pages,
   including each love mobile's detail page) into committed JSON under
   `data/`: every stage and love mobile with location, style tags, and its
   artists with set times where published. Include `scripts/scrape.mjs` so
   the data can be refreshed before the event.
2. **Snippet catalog** — `scripts/build-catalog.mjs` maps every artist to
   1–3 top tracks with 30-second preview audio via the Deezer public API,
   falling back to the iTunes Search API; commit the result as
   `data/catalog.json` (artist → tracks with provider track IDs, titles,
   genres). Preview URLs are resolved fresh at runtime through an API route,
   with the catalog storing only stable IDs. Artists with no findable
   preview are kept in the data (they still appear in schedules) but
   excluded from the swipe deck.
3. **App** — Next.js (App Router, TypeScript, Tailwind) at the repo root:
   - *Filter screen*: style checkboxes derived from the data's genre tags,
     default all-on.
   - *Swipe screen*: plays a preview snippet with artist/track hidden;
     buttons Like / Nope / Skip; after each vote, reveal card shows artist,
     track, and where/when they play; progress toward a 20-vote target
     (user can keep going or stop early once ≥10).
   - *Results screen*: scores every artist (direct votes strong, genre
     similarity for unvoted artists), then renders an hour-by-hour
     recommended schedule 13:00–24:00 choosing the best-scoring act per
     time window from fixed stages, plus a ranked "catch these love
     mobiles along the parade" list (mobiles are roaming, so they get
     recommendations, not time slots). Re-swipe and re-filter reachable
     from here.
   - State in localStorage; no accounts, no database, no env vars.
4. **Verified** — `next build` passes; the running app plays real audio
   previews and completes filter → swipe → reveal → results end to end.
5. **Shipped** — All work committed to branch
   `claude/bypass-permissions-user-settings-5s7260`, pushed, and a draft PR
   opened against `main`. Vercel (preset: Next.js, default build settings,
   no env vars) deploys when the user merges.

Acceptance: a phone user who opens the deployed URL cold can pick styles,
vote on ≥10 blind snippets with audible playback, and receive a concrete
schedule naming real artists, stages, and times for 8 August.
</objective>

<constraints>
- Audio comes from 30-second public preview clips (Deezer primary, iTunes
  fallback) played in a plain `<audio>` element — no OAuth, no Spotify/
  YouTube/SoundCloud SDKs, nothing the friend group must log into. Keep
  every reveal card's outbound links limited to a plain web search link so
  no platform account is assumed.
- Mobile-first and dark-themed; it will be used outdoors on phones. Desktop
  merely has to look acceptable.
- This is a hobby tool for one friend group: no analytics, no tracking, no
  cookie banner, no commercial features.
- Scope is v1 as specified. Add nothing speculative (no PWA install flow,
  no share-to-social, no i18n) and refactor nothing beyond what the build
  needs. Later native apps are out of scope.
- Respect the event site: scrape politely (sequential or small-batch
  fetches, one pass), commit the scraped JSON so runtime traffic never hits
  streetparade.com.
- Develop on the designated branch only; never push to `main` directly.
</constraints>

<workflow>
Phases gate on each other: data → catalog → app → verify → ship. Delegate
independent subtasks (per-love-mobile scraping, catalog lookups per artist
batch) to subagents and keep building while they run. Verify with a
fresh-context check against the acceptance criteria, not self-review.
When you have enough information to act, act; give recommendations, not
option surveys. Before reporting progress, audit each claim against a tool
result from this session; report failures plainly with output.
</workflow>

<blocker_protocol>
If a data source is missing (e.g., love-mobile artist lists unpublished) or
an API is unreachable: note it in the PR body, ship the best version that
works without it, and list exactly what the user could provide to fill the
gap. Only stop for decisions that change the product's shape.
</blocker_protocol>

<stop_conditions>
Done when the acceptance test above passes locally and the draft PR exists.
Your final message states the Vercel preset/build/env answer, what was
verified (with evidence), and any gaps with their fill-in path.
</stop_conditions>
