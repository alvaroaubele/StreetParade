// Maps every artist in data/event.json to playable 30s preview tracks.
// Deezer primary, iTunes fallback. Stores stable track IDs only — preview
// URLs expire (~1h on Deezer) and are resolved at runtime by /api/preview.
// Run: npm run catalog   (re-run any time; safe to re-run, it starts fresh)
import { readFileSync, writeFileSync } from "node:fs";
import { normKey, primaryName } from "../lib/normalize.mjs";

const DATA = new URL("../data/", import.meta.url).pathname;
const event = JSON.parse(readFileSync(DATA + "event.json", "utf8"));

function similarity(a, b) {
  const na = normKey(a), nb = normKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (nb.startsWith(na) || na.startsWith(nb))
    return 0.9 * (Math.min(na.length, nb.length) / Math.max(na.length, nb.length)) + 0.05;
  const ta = new Set(na.split(" ")), tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (body?.error?.code === 4) {
        await sleep(2500); // Deezer quota — back off and retry
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return body;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

// A name match is not an identity match: "Valentino" the techno DJ resolves
// to a reggaeton artist of the same name. Provider genres are the identity
// check — every act at this event is electronic, so a match whose genres
// are known and contain nothing electronic is a namesake, not the DJ.
// Some namesakes carry a stray "Dance" tag (a children's-music act did),
// so hard-reject genres win over the accept list.
const ELECTRONIC = /electro|techno|house|dance|trance|drum|dubstep|edm|hard/i;
const HARD_REJECT = /children|kids|kinder|comedy|spoken|karaoke/i;

const overrides = JSON.parse(readFileSync(DATA + "overrides.json", "utf8"));
const blockedKeys = new Set((overrides.blocked ?? []).map((n) => normKey(n)));
const forceTrustKeys = new Set((overrides.forceTrust ?? []).map((n) => normKey(n)));

async function deezerLookup(name) {
  const q = encodeURIComponent(name);
  const search = await getJSON(`https://api.deezer.com/search/artist?q=${q}&limit=5`);
  const cands = search?.data ?? [];
  let best = null, bestScore = 0;
  for (const c of cands) {
    const s = similarity(name, c.name);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  if (!best || bestScore < 0.8) return null;
  const top = await getJSON(`https://api.deezer.com/artist/${best.id}/top?limit=10`);
  const rawTracks = (top?.data ?? []).filter((t) => t.preview);
  if (!rawTracks.length) return null;
  let providerGenres = [];
  const albumId = rawTracks[0]?.album?.id;
  if (albumId) {
    await sleep(150);
    const album = await getJSON(`https://api.deezer.com/album/${albumId}`);
    providerGenres = (album?.genres?.data ?? []).map((g) => g.name);
  }
  const tracks = rawTracks
    .slice(0, 10)
    .map((t) => ({ provider: "deezer", trackId: String(t.id), title: t.title }));
  return {
    provider: "deezer",
    providerArtist: best.name,
    providerArtistId: String(best.id),
    fans: best.nb_fan ?? null,
    score: bestScore,
    providerGenres,
    genreOk: providerGenres.length ? providerGenres.some((g) => ELECTRONIC.test(g)) : null,
    tracks,
  };
}

async function itunesLookup(name) {
  const q = encodeURIComponent(name);
  const res = await getJSON(
    `https://itunes.apple.com/search?term=${q}&entity=musicTrack&attribute=artistTerm&limit=15`
  );
  const byArtist = new Map();
  for (const r of res?.results ?? []) {
    if (!r.previewUrl) continue;
    const s = similarity(name, r.artistName);
    if (s < 0.8) continue;
    if (!byArtist.has(r.artistName)) byArtist.set(r.artistName, { score: s, tracks: [], genres: new Set() });
    const e = byArtist.get(r.artistName);
    if (r.primaryGenreName) e.genres.add(r.primaryGenreName);
    if (e.tracks.length < 10)
      e.tracks.push({ provider: "itunes", trackId: String(r.trackId), title: r.trackName });
  }
  let bestName = null, best = null;
  for (const [n, e] of byArtist) if (!best || e.score > best.score) { bestName = n; best = e; }
  if (!best) return null;
  const providerGenres = [...best.genres];
  return {
    provider: "itunes",
    providerArtist: bestName,
    providerArtistId: null,
    fans: null,
    score: best.score,
    providerGenres,
    genreOk: providerGenres.length ? providerGenres.some((g) => ELECTRONIC.test(g)) : null,
    tracks: best.tracks,
  };
}

// A single common word is too ambiguous to trust a name-only match: the top
// search hit is usually a different, more famous act with the same name.
const isGenericName = (name) => {
  const n = normKey(name);
  return n.split(" ").length === 1 && n.length <= 6;
};

const headlinerKeys = new Set((event.headliners ?? []).map((n) => normKey(n)));

const unique = new Map();
for (const v of event.venues)
  for (const a of v.artists) {
    const key = normKey(a.name);
    if (key && !unique.has(key)) unique.set(key, a.name);
  }

console.log(`Resolving ${unique.size} unique artists…`);
const catalog = {};
let hits = 0, generic = 0, misses = 0, i = 0;

for (const [key, displayName] of unique) {
  i++;
  const lookupName = primaryName(displayName);
  let entry = null;
  try {
    entry = await deezerLookup(lookupName);
    await sleep(250);
    if (!entry) {
      entry = await itunesLookup(lookupName);
      await sleep(150);
    }
  } catch (e) {
    console.warn(`  ! ${displayName}: ${e.message}`);
  }
  if (entry) {
    // Two independent guards: (1) known provider genres with nothing
    // electronic = a namesake, rejected outright regardless of name shape
    // or fame; (2) generic one-word names additionally need a headliner
    // billing or a substantial fanbase, since a namesake can be electronic
    // too. Unknown genres stay neutral — small local DJs often lack tags.
    const isHeadliner = headlinerKeys.has(key);
    const hardReject = (entry.providerGenres ?? []).some((g) => HARD_REJECT.test(g));
    const genreReject = hardReject || entry.genreOk === false;
    let trusted =
      !genreReject &&
      (!isGenericName(displayName) || isHeadliner || (entry.fans ?? 0) >= 10000);
    if (blockedKeys.has(key)) trusted = false;
    if (forceTrustKeys.has(key)) trusted = true;
    catalog[key] = { name: displayName, ...entry, trusted };
    if (!trusted && (genreReject || blockedKeys.has(key)))
      console.log(`  ✗ rejected: ${displayName} → "${entry.providerArtist}" [${(entry.providerGenres ?? []).join(", ")}]${blockedKeys.has(key) ? " (override)" : ""}`);
    trusted ? hits++ : generic++;
  } else {
    catalog[key] = { name: displayName, provider: null, tracks: [], trusted: false };
    misses++;
  }
  if (i % 20 === 0) console.log(`  ${i}/${unique.size} (${hits} trusted, ${generic} generic-flagged, ${misses} no preview)`);
}

// Trim the playable pool so the swipe deck holds exactly 369 snippets:
// 370 here because the landing page's welcome track is excluded from the
// deck. Shaves from the artists with the most tracks first, and the trim
// pops from the tail so the welcome pick (an artist's first track) survives.
const POOL_TARGET = 370;
const trusted = Object.values(catalog).filter((a) => a.trusted && a.tracks.length);
let pool = trusted.reduce((n, a) => n + a.tracks.length, 0);
while (pool > POOL_TARGET) {
  trusted.sort((a, b) => b.tracks.length - a.tracks.length);
  trusted[0].tracks.pop();
  pool--;
}

writeFileSync(DATA + "catalog.json", JSON.stringify({ builtAt: new Date().toISOString(), artists: catalog }, null, 2));
console.log(
  `Done: ${hits} trusted matches (${pool} playable snippets, target ${POOL_TARGET}), ` +
    `${generic} generic-name flagged (kept out of deck), ${misses} without preview, of ${unique.size} artists.`
);
