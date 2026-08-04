import { NextRequest, NextResponse } from "next/server";
import { welcomeTrackCandidates } from "@/lib/data";

// Streams the welcome-vibe audio itself, not a URL to it. The client plays
// /api/vibe as a same-origin source, which removes every phone-side failure
// mode at once: no signed Deezer URL that expires mid-hold, no geo-blocked
// CDN edge (the upstream fetch happens here, server-side), no CORS. The
// signed URL is resolved fresh per fetch and consumed immediately, so its
// 15-minute life is irrelevant. Falls through the welcome-track candidate
// list until one yields real bytes.

export const dynamic = "force-dynamic";

// One small MP3 (~500KB); warm instances serve range probes from memory.
let cached: { bytes: Buffer; at: number } | null = null;
const BYTES_TTL = 60 * 60 * 1000;

async function vibeBytes(): Promise<Buffer | null> {
  if (cached && Date.now() - cached.at < BYTES_TTL) return cached.bytes;
  for (const { track } of welcomeTrackCandidates()) {
    try {
      let url: string | null = null;
      if (track.provider === "deezer") {
        const res = await fetch(`https://api.deezer.com/track/${track.trackId}`, { cache: "no-store" });
        url = (await res.json())?.preview || null;
      } else {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${track.trackId}`, {
          next: { revalidate: 86400 },
        });
        url = (await res.json())?.results?.[0]?.previewUrl || null;
      }
      if (!url) continue;
      const audio = await fetch(url, { cache: "no-store" });
      if (!audio.ok) continue;
      const bytes = Buffer.from(await audio.arrayBuffer());
      if (bytes.byteLength < 10_000) continue; // error page, not audio
      cached = { bytes, at: Date.now() };
      return bytes;
    } catch {
      // next candidate
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const bytes = await vibeBytes();
  if (!bytes) return NextResponse.json({ error: "no vibe" }, { status: 404 });

  const total = bytes.byteLength;
  const common = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    // The bytes are immutable for a given track, so both the CDN and the
    // browser may hold them; a track swap shows up within the hour.
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
  };

  // iOS Safari probes media with Range requests (often `bytes=0-1`) and
  // refuses sources that answer them with a 200 — a real slice is required.
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    } else {
      start = Math.max(total - Number(m[2]), 0);
      end = total - 1;
    }
    if (start > end || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...common, "Content-Range": `bytes */${total}` },
      });
    }
    const body = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(body), {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(body.byteLength),
      },
    });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { ...common, "Content-Length": String(total) },
  });
}
