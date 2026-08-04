import eventJson from "@/data/event.json";
import catalogJson from "@/data/catalog.json";
import type { Catalog, DeckCard, EventData, Filters, SocialLink, TimeBlock } from "./types";
export { normKey } from "./normalize.mjs";
import { normKey } from "./normalize.mjs";

export const eventData = eventJson as unknown as EventData;
export const catalog = catalogJson as unknown as Catalog;

/** Canonical genres, each with keywords matched against venue style strings. */
const GENRE_KEYWORDS: [string, RegExp][] = [
  ["House", /\bhouse\b(?!.*afro)|future house|indie house|deep house/i],
  ["Tech House", /tech\s*house/i],
  ["Techno", /\btechno\b/i],
  ["Hard Techno", /hard\s*techno|peak time/i],
  ["Melodic", /melodic/i],
  ["Afro House", /afro\s*house|afrohouse/i],
  ["Trance", /\btrance\b(?!.*psy)/i],
  ["Hardtrance", /hardtrance|hard trance/i],
  ["Psytrance", /psy[\s-]*trance|psytrance|\bpsy\b|psychedelic/i],
  ["Drum and Bass", /drum\s*and\s*bass|drum'n'bass|dnb/i],
  ["Hardcore / Gabber", /hardcore|gabber|up-?tempo/i],
  ["Hypertechno / EDM", /hypertechno|\bedm\b|bounce|electro\b/i],
  ["Indie Dance", /indie dance/i],
  ["Disco", /\bdisco\b/i],
  ["Progressive", /progressive|progessive/i],
];

export function stylesToGenres(styles: string): string[] {
  const out: string[] = [];
  for (const [genre, re] of GENRE_KEYWORDS) if (re.test(styles)) out.push(genre);
  return out.length ? out : ["Techno"];
}

export const allGenres: string[] = (() => {
  const s = new Set<string>();
  for (const v of eventData.venues) for (const g of stylesToGenres(v.styles)) s.add(g);
  return GENRE_KEYWORDS.map(([g]) => g).filter((g) => s.has(g));
})();

export const TIME_BLOCKS: TimeBlock[] = [
  { id: "early", label: "Early · 13–16", fromMin: 13 * 60, toMin: 16 * 60 },
  { id: "afternoon", label: "Afternoon · 16–19", fromMin: 16 * 60, toMin: 19 * 60 },
  { id: "evening", label: "Evening · 19–22", fromMin: 19 * 60, toMin: 22 * 60 },
  { id: "night", label: "Night · 22–24", fromMin: 22 * 60, toMin: 24 * 60 },
];

export const venueLabel = (v: { type: string; num?: number | null; name: string }) =>
  v.type === "mobile" ? `Love Mobile ${v.num ? "#" + v.num + " " : ""}${v.name}` : v.name;

export const allStages = eventData.venues.filter((v) => v.type === "stage");
export const allMobiles = eventData.venues.filter((v) => v.type === "mobile");

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export interface ArtistInfo {
  key: string;
  name: string;
  genres: string[];
  venueNames: string[];
  /** Set-start minutes (timed stage sets) and mobile windows [from,to]. */
  setStarts: number[];
  windows: [number, number][];
  appearances: DeckCard["appearances"];
}

/** Every artist with venue-derived genres and where/when they play. */
export const artistIndex: Map<string, ArtistInfo> = (() => {
  const map = new Map<string, ArtistInfo>();
  for (const v of eventData.venues) {
    const genres = stylesToGenres(v.styles);
    const label = venueLabel(v);
    let window: [number, number] | null = null;
    const wm = v.timeWindow?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (wm) window = [toMin(wm[1]), toMin(wm[2])];
    for (const a of v.artists) {
      const key = normKey(a.name);
      if (!key) continue;
      const entry =
        map.get(key) ??
        { key, name: a.name, genres: [], venueNames: [], setStarts: [], windows: [], appearances: [] };
      entry.genres = [...new Set([...entry.genres, ...genres])];
      if (!entry.venueNames.includes(v.name)) entry.venueNames.push(v.name);
      if (a.time) entry.setStarts.push(toMin(a.time));
      if (window) entry.windows.push(window);
      entry.appearances.push({ venue: label, venueType: v.type, time: a.time, timeWindow: v.timeWindow ?? null });
      map.set(key, entry);
    }
  }
  return map;
})();

export function artistSocials(key: string): SocialLink[] {
  return eventData.socials?.[key] ?? [];
}

export function defaultFilters(): Filters {
  return {
    genres: [...allGenres],
    venues: eventData.venues.map((v) => v.name),
    blocks: TIME_BLOCKS.map((b) => b.id),
    artists: null,
  };
}

function matchesBlocks(info: ArtistInfo, blockIds: string[]): boolean {
  if (blockIds.length === TIME_BLOCKS.length) return true;
  const blocks = TIME_BLOCKS.filter((b) => blockIds.includes(b.id));
  // No timing info at all → can play any time; keep.
  if (!info.setStarts.length && !info.windows.length) return true;
  for (const b of blocks) {
    if (info.setStarts.some((t) => t >= b.fromMin && t < b.toMin)) return true;
    if (info.windows.some(([f, t]) => f < b.toMin && t > b.fromMin)) return true;
  }
  return false;
}

export function eligibleArtists(filters: Filters): ArtistInfo[] {
  const genres = new Set(filters.genres);
  const venues = new Set(filters.venues);
  const whitelist = filters.artists ? new Set(filters.artists) : null;
  const out: ArtistInfo[] = [];
  for (const [key, info] of artistIndex) {
    if (whitelist && !whitelist.has(key)) continue;
    if (!info.genres.some((g) => genres.has(g))) continue;
    if (!info.venueNames.some((v) => venues.has(v))) continue;
    if (!matchesBlocks(info, filters.blocks)) continue;
    out.push(info);
  }
  return out;
}

/** Mulberry32 — deterministic shuffle given a seed. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function playableCount(filters: Filters): { snippets: number; artists: number } {
  let snippets = 0, artists = 0;
  for (const info of eligibleArtists(filters)) {
    const cat = catalog.artists[info.key];
    if (cat?.trusted && cat.tracks.length) {
      artists++;
      snippets += cat.tracks.length;
    }
  }
  return { snippets, artists };
}

/**
 * The landing-page ambience track: warm, mid-spectrum, nothing that would
 * polarize a blind test (no hardstyle/psy). Preference-ordered so it stays
 * stable across catalog rebuilds.
 */
export function welcomeTrack(): { artistKey: string; artistName: string; track: import("./types").CatalogTrack } | null {
  for (const key of ["blond ish", "animal trainer", "andrea oliva", "sonny fodera", "vintage culture"]) {
    const cat = catalog.artists[key];
    if (cat?.trusted && cat.tracks.length) return { artistKey: key, artistName: cat.name, track: cat.tracks[0] };
  }
  return null;
}

/**
 * Deck = every (eligible artist, track) pair, shuffled, then spread so the
 * same artist never appears back-to-back. The welcome-vibe track is excluded —
 * everyone has already heard it with the artist unknown but recognizable.
 */
export function buildDeck(filters: Filters, seed = Date.now()): DeckCard[] {
  const welcome = welcomeTrack();
  const cards: DeckCard[] = [];
  for (const info of eligibleArtists(filters)) {
    const cat = catalog.artists[info.key];
    if (!cat || !cat.trusted || !cat.tracks.length) continue;
    for (const track of cat.tracks) {
      if (welcome && track.provider === welcome.track.provider && track.trackId === welcome.track.trackId) continue;
      cards.push({
        artistKey: info.key,
        artistName: info.name,
        track,
        genres: info.genres,
        appearances: info.appearances,
      });
    }
  }
  const rand = rng(seed);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  // Greedy de-clump: push a card one slot back when it repeats the previous artist.
  for (let i = 1; i < cards.length - 1; i++) {
    if (cards[i].artistKey === cards[i - 1].artistKey)
      [cards[i], cards[i + 1]] = [cards[i + 1], cards[i]];
  }
  return cards;
}
