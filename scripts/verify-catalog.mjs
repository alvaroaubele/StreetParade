// Probes every trusted track end to end: resolve the preview URL from the
// provider API, then range-fetch the first bytes of the media and check they
// look like audio. Reports dead tracks. Run: node scripts/verify-catalog.mjs
// (Liveness from this network only — region blocks elsewhere can't be seen.)
import { readFileSync } from "node:fs";

const cat = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")).artists;

async function probe(track) {
  const api =
    track.provider === "deezer"
      ? `https://api.deezer.com/track/${track.trackId}`
      : `https://itunes.apple.com/lookup?id=${track.trackId}`;
  const r = await fetch(api);
  const j = await r.json();
  const url = track.provider === "deezer" ? j?.preview : j?.results?.[0]?.previewUrl;
  if (!url) return "no-url";
  const m = await fetch(url, { headers: { Range: "bytes=0-511" } });
  if (!(m.status === 200 || m.status === 206)) return `http-${m.status}`;
  const buf = new Uint8Array(await m.arrayBuffer());
  const looksAudio = buf.length > 100 && (buf[0] === 0x49 || buf[0] === 0xff || buf[0] === 0x00);
  return looksAudio ? "ok" : "not-audio";
}

const jobs = [];
for (const [key, a] of Object.entries(cat)) {
  if (!a.trusted) continue;
  for (const t of a.tracks) jobs.push({ key, name: a.name, t });
}
console.log(`probing ${jobs.length} tracks…`);
const dead = [];
let done = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (jobs.length) {
    const j = jobs.pop();
    let verdict;
    try {
      verdict = await probe(j.t);
    } catch (e) {
      verdict = `err-${e.message?.slice(0, 30)}`;
    }
    if (verdict !== "ok") {
      dead.push({ ...j, verdict });
      console.log(`  DEAD ${j.name} — "${j.t.title}" (${j.t.provider}:${j.t.trackId}) ${verdict}`);
    }
    if (++done % 50 === 0) console.log(`  ${done} probed…`);
    await new Promise((r) => setTimeout(r, 120));
  }
});
await Promise.all(workers);
console.log(`done: ${done} probed, ${dead.length} dead`);
