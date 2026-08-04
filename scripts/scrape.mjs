// Scrapes streetparade.com (stages, line-up, love-mobiles) into data/event.json.
// Refresh before the event: npm run scrape
// Polite: three sequential page fetches, no crawling. All artist/venue data
// is inline in these pages (popups/accordions), so no extra requests needed.
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";
import { normKey } from "../lib/normalize.mjs";

// aria-label "soundcloud link" → kind "soundcloud"
const SOCIAL_KINDS = ["soundcloud", "instagram", "facebook", "website", "spotify", "youtube", "tiktok"];

function socialsFrom($, container) {
  const out = [];
  $(container)
    .find("a.social-item")
    .each((_, a) => {
      const url = $(a).attr("href");
      const label = ($(a).attr("aria-label") ?? "").toLowerCase();
      const kind = SOCIAL_KINDS.find((k) => label.includes(k)) ?? "website";
      if (url) out.push({ kind, url });
    });
  return out;
}

/** normKey(artist) → [{kind,url}] accumulated across all pages. */
const socials = {};
function addSocials(name, list) {
  if (!list.length) return;
  const key = normKey(name);
  if (!key) return;
  const cur = socials[key] ?? [];
  for (const s of list) if (!cur.some((x) => x.url === s.url)) cur.push(s);
  socials[key] = cur;
}

const BASE = "https://www.streetparade.com";
const OUT = new URL("../data/", import.meta.url).pathname;

// Stage style tags are prose on the site, not structured; hand-checked
// against streetparade.com/en/stages on 2026-08-04.
const STAGE_STYLES = {
  "Opéra Stage": "House, Techno",
  "Center Stage": "House, Tech House",
  "Clubbing Stage": "House, Techno, Disco",
  "Innovation Stage": "Hard Techno, Techno",
  "Zürich Sound Stage": "House, Indie Dance, Tech House, Melodic House",
  "Generations Stage": "Psytrance, Progressive Psy",
  "Young Talent Stage": "House, Tech House, Indie Dance",
  "Electric Circus Stage": "Techno, Psytrance",
  "Opening Truck": "Techno",
};

const clean = (s) => (s ?? "").replace(/\s+/g, " ").replace(/ /g, " ").trim();

async function fetchPage(path) {
  const res = await fetch(BASE + path, {
    headers: { "user-agent": "ParadeMatch/1.0 (private friend-group tool)" },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

function parseStages(html) {
  const $ = cheerio.load(html);
  const stages = [];
  $("li.stage").each((_, el) => {
    const $el = $(el);
    const name = clean($el.find("h3.h2").first().text());
    if (!name || stages.some((s) => s.name === name)) return;
    const desc = clean($el.find("p.medium").first().text());
    const artists = [];
    $el.find(".stage-popup .accordion-header").each((_, a) => {
      const spans = $(a).children("span");
      const artist = clean(spans.eq(0).text());
      const time = clean(spans.eq(1).text()).match(/\d{1,2}:\d{2}/)?.[0] ?? null;
      if (artist && !artists.some((x) => x.name === artist))
        artists.push({ name: artist, time });
      if (artist) addSocials(artist, socialsFrom($, $(a).next(".accordion-container")));
    });
    stages.push({
      type: "stage",
      name,
      styles: STAGE_STYLES[name] ?? "",
      desc,
      artists,
    });
  });
  return stages;
}

function parseMobiles(html) {
  const $ = cheerio.load(html);
  const mobiles = [];
  $("li.love-mobiles-item").each((_, el) => {
    const $el = $(el);
    const title = clean($el.find("h3.h2").first().text());
    if (!title) return;
    const m = title.match(/^(\d+)\.\s*(.+)$/);
    const num = m ? Number(m[1]) : null;
    const name = m ? m[2] : title;
    if (mobiles.some((x) => x.name === name)) return;
    const infoPs = $el.children(".info-container").find("p");
    const styles = clean(infoPs.eq(0).text());
    const theme = clean(infoPs.eq(1).text());
    const popup = $el.find(".love-mobiles-popup").first();
    const timeWindow =
      clean(popup.find(".info-item p").first().text()).match(
        /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/
      )?.[0] ?? null;
    const desc = clean(popup.find(".info-item p.medium").first().text());
    const artists = [];
    popup.find(".performances-list .accordion-header").each((_, a) => {
      const spans = $(a).children("span");
      const artist = clean(spans.eq(0).text());
      const time = clean(spans.eq(1).text()).match(/\d{1,2}:\d{2}/)?.[0] ?? null;
      if (artist && !artists.some((x) => x.name === artist))
        artists.push({ name: artist, time });
      if (artist) addSocials(artist, socialsFrom($, $(a).next(".accordion-container")));
    });
    mobiles.push({ type: "mobile", num, name, styles, theme, timeWindow, desc, artists });
  });
  return mobiles;
}

// Line-up page: headliners carry set time + venue; the full roster maps each
// artist to a venue string like "20. JUR Records (AG)" or "Opéra Stage".
function parseLineup(html) {
  const $ = cheerio.load(html);
  const entries = [];
  $("li.headliner-item, li.artist-list-item").each((_, el) => {
    const $el = $(el);
    const name = clean($el.find("h3.h2").first().text());
    if (!name) return;
    const info = clean($el.find(".info-list").first().text());
    const time = info.match(/^\d{1,2}:\d{2}(?=\s|$)/)?.[0] ?? null;
    const venue = clean(info.replace(/^\d{1,2}:\d{2}\s*/, ""));
    const headliner = $el.hasClass("headliner-item");
    addSocials(name, socialsFrom($, el));
    entries.push({ name, time, venue: venue || null, headliner });
  });
  return entries;
}

function mergeLineupIntoVenues(venues, lineup) {
  const byNum = new Map(venues.filter((v) => v.num).map((v) => [v.num, v]));
  const byName = new Map(venues.map((v) => [v.name.toLowerCase(), v]));
  let added = 0;
  for (const e of lineup) {
    if (!e.venue) continue;
    const numMatch = e.venue.match(/^(\d+)\.\s*/);
    let venue = null;
    if (numMatch) venue = byNum.get(Number(numMatch[1]));
    if (!venue) {
      // Exact name first; then one-direction prefix only — two-way substring
      // matching can bind a roster artist to the wrong venue on a re-scrape.
      const key = e.venue.replace(/\s*\(.*\)$/, "").toLowerCase();
      venue =
        byName.get(key) ??
        venues.find((v) => key.startsWith(v.name.toLowerCase()));
    }
    if (!venue) {
      console.warn(`  ! line-up entry not matched to a venue: "${e.name}" → "${e.venue}"`);
      continue;
    }
    const existing = venue.artists.find(
      (a) => a.name.toLowerCase() === e.name.toLowerCase()
    );
    if (existing) {
      if (!existing.time && e.time) existing.time = e.time;
    } else {
      venue.artists.push({ name: e.name, time: e.time });
      added++;
    }
  }
  return added;
}

const [stagesHtml, mobilesHtml, lineupHtml] = [
  await fetchPage("/en/stages"),
  await fetchPage("/en/love-mobiles"),
  await fetchPage("/en/line-up"),
];

const venues = [...parseStages(stagesHtml), ...parseMobiles(mobilesHtml)];
const lineup = parseLineup(lineupHtml);
const added = mergeLineupIntoVenues(venues, lineup);

const event = {
  scrapedAt: new Date().toISOString(),
  event: { name: "Street Parade Zürich 2026", date: "2026-08-08" },
  headliners: lineup.filter((e) => e.headliner).map((e) => e.name),
  venues,
  socials,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "event.json", JSON.stringify(event, null, 2));

const nStages = venues.filter((v) => v.type === "stage").length;
const nMobiles = venues.filter((v) => v.type === "mobile").length;
const nArtists = venues.reduce((n, v) => n + v.artists.length, 0);
console.log(
  `stages: ${nStages}, mobiles: ${nMobiles}, artist slots: ${nArtists} ` +
    `(+${added} merged from line-up roster of ${lineup.length}), ` +
    `artists with social links: ${Object.keys(socials).length}`
);
if (nStages < 5 || nMobiles < 10 || nArtists < 100)
  throw new Error("Scrape looks incomplete — selectors may have drifted.");
