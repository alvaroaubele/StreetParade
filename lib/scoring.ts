import { artistIndex, eventData, normKey, stylesToGenres } from "./data";
import type { Venue, VoteTally } from "./types";

export interface ScoredArtist {
  key: string;
  name: string;
  score: number;
  direct: boolean;
  genres: string[];
  appearances: { venue: string; venueType: "stage" | "mobile"; time: string | null; timeWindow?: string | null }[];
}

export interface ScheduleBlock {
  from: string;
  to: string;
  artist: string;
  stage: string;
  score: number;
}

export interface MobilePick {
  label: string;
  styles: string;
  timeWindow: string | null;
  score: number;
  topArtists: string[];
}

export interface Recommendation {
  ranked: ScoredArtist[];
  timeline: ScheduleBlock[];
  mobiles: MobilePick[];
  genreProfile: [string, number][];
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const net = (t: VoteTally | undefined) => (t ? t.l - t.n : 0);
const heard = (t: VoteTally | undefined) => !!t && t.l + t.n > 0;

/**
 * Direct votes dominate (net likes over an artist's cards, clamped to ±2);
 * genre affinity learned from votes ranks everyone else.
 */
export function recommend(votes: Record<string, VoteTally>): Recommendation {
  const genreScore = new Map<string, { sum: number; n: number }>();
  for (const [key, tally] of Object.entries(votes)) {
    if (!heard(tally)) continue;
    const info = artistIndex.get(key);
    if (!info) continue;
    const signal = Math.max(-1, Math.min(1, net(tally)));
    for (const g of info.genres) {
      const e = genreScore.get(g) ?? { sum: 0, n: 0 };
      e.sum += signal;
      e.n++;
      genreScore.set(g, e);
    }
  }
  const genreAffinity = (g: string) => {
    const e = genreScore.get(g);
    return e && e.n ? e.sum / e.n : 0;
  };

  const ranked: ScoredArtist[] = [];
  for (const [key, info] of artistIndex) {
    const tally = votes[key];
    const genreAvg =
      info.genres.reduce((s, g) => s + genreAffinity(g), 0) / (info.genres.length || 1);
    const direct = heard(tally);
    const score = direct
      ? Math.max(-2, Math.min(2, net(tally))) + genreAvg * 0.5
      : genreAvg;
    ranked.push({ key, name: info.name, score, direct, genres: info.genres, appearances: info.appearances });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const scoreByKey = new Map(ranked.map((r) => [r.key, r.score]));

  // Timeline over fixed stages: at each half-hour 13:00–24:00 pick the
  // best-scoring set currently playing; merge consecutive picks.
  interface Slot { artist: string; stage: string; start: number; end: number; score: number }
  const slots: Slot[] = [];
  for (const v of eventData.venues as Venue[]) {
    if (v.type !== "stage") continue;
    const timed = v.artists
      .filter((a) => a.time)
      .map((a) => ({ name: a.name, start: toMin(a.time!) }))
      .sort((a, b) => a.start - b.start);
    timed.forEach((a, i) => {
      const end = i + 1 < timed.length ? timed[i + 1].start : Math.min(a.start + 90, 24 * 60);
      slots.push({
        artist: a.name,
        stage: v.name,
        start: a.start,
        end,
        score: scoreByKey.get(normKey(a.name)) ?? 0,
      });
    });
  }
  const picks: Slot[] = [];
  for (let t = 13 * 60; t < 24 * 60; t += 30) {
    const live = slots.filter((s) => s.start <= t && t < s.end);
    if (!live.length) continue;
    live.sort((a, b) => b.score - a.score);
    picks.push({ ...live[0], start: t, end: t + 30 });
  }
  const timeline: ScheduleBlock[] = [];
  for (const p of picks) {
    const last = timeline[timeline.length - 1];
    if (last && last.artist === p.artist && last.stage === p.stage) {
      last.to = toHHMM(p.end);
    } else {
      timeline.push({ from: toHHMM(p.start), to: toHHMM(p.end), artist: p.artist, stage: p.stage, score: p.score });
    }
  }

  // Love mobiles are roaming: rank them by their artists' scores.
  const mobiles: MobilePick[] = (eventData.venues as Venue[])
    .filter((v) => v.type === "mobile")
    .map((v) => {
      const scores = v.artists
        .map((a) => ({ name: a.name, s: scoreByKey.get(normKey(a.name)) ?? 0 }))
        .sort((a, b) => b.s - a.s);
      const top = scores.slice(0, 3);
      const avg = top.length ? top.reduce((s, x) => s + x.s, 0) / top.length : 0;
      const gs = stylesToGenres(v.styles);
      const genreAvg = gs.reduce((s, g) => s + genreAffinity(g), 0) / (gs.length || 1);
      return {
        label: `${v.num ? "#" + v.num + " " : ""}${v.name}`,
        styles: v.styles,
        timeWindow: v.timeWindow ?? null,
        score: avg + genreAvg * 0.5,
        topArtists: top.filter((x) => x.s > 0).map((x) => x.name),
      };
    })
    .sort((a, b) => b.score - a.score);

  const genreProfile: [string, number][] = [...genreScore.entries()]
    .map(([g, e]) => [g, e.n ? e.sum / e.n : 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  return { ranked, timeline, mobiles, genreProfile };
}

/** Plain-text route summary for pasting into the group chat. */
export function shareText(rec: Recommendation, voteCount: number): string {
  const lines: string[] = [`My ParadeMatch route · Street Parade 8 Aug (from ${voteCount} blind votes)`];
  for (const b of rec.timeline) lines.push(`${b.from}–${b.to}  ${b.artist} @ ${b.stage}${b.score > 1.5 ? " 🔥" : ""}`);
  const mobiles = rec.mobiles.filter((m) => m.score > 0).slice(0, 3);
  if (mobiles.length) {
    lines.push("Love Mobiles:");
    for (const m of mobiles) lines.push(`· ${m.label}${m.timeWindow ? ` (${m.timeWindow})` : ""}`);
  }
  return lines.join("\n");
}
