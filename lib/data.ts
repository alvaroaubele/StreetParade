import eventJson from "@/data/event.json";
import catalogJson from "@/data/catalog.json";
import type { Catalog, DeckCard, EventData, Venue } from "./types";

export const eventData = eventJson as EventData;
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

export { normKey } from "./normalize.mjs";
import { normKey } from "./normalize.mjs";

export interface ArtistInfo {
  key: string;
  name: string;
  genres: string[];
  appearances: DeckCard["appearances"];
}

/** Every artist with venue-derived genres and where/when they play. */
export const artistIndex: Map<string, ArtistInfo> = (() => {
  const map = new Map<string, ArtistInfo>();
  for (const v of eventData.venues) {
    const genres = stylesToGenres(v.styles);
    for (const a of v.artists) {
      const key = normKey(a.name);
      if (!key) continue;
      const venueLabel = v.type === "mobile" ? `Love Mobile ${v.num ? "#" + v.num + " " : ""}${v.name}` : v.name;
      const entry = map.get(key) ?? { key, name: a.name, genres: [], appearances: [] };
      entry.genres = [...new Set([...entry.genres, ...genres])];
      entry.appearances.push({
        venue: venueLabel,
        venueType: v.type,
        time: a.time,
        timeWindow: v.timeWindow ?? null,
      });
      map.set(key, entry);
    }
  }
  return map;
})();

/** Mulberry32 — deterministic shuffle so a shared seed gives the same deck. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDeck(selectedGenres: string[], seed = Date.now()): DeckCard[] {
  const chosen = new Set(selectedGenres);
  const cards: DeckCard[] = [];
  for (const [key, info] of artistIndex) {
    const cat = catalog.artists[key];
    if (!cat || !cat.trusted || !cat.tracks.length) continue;
    if (!info.genres.some((g) => chosen.has(g))) continue;
    cards.push({
      artistKey: key,
      artistName: info.name,
      track: cat.tracks[Math.floor(rng(seed + key.length * 7919)() * cat.tracks.length)],
      genres: info.genres,
      appearances: info.appearances,
    });
  }
  const rand = rng(seed);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, 40);
}
