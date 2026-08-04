import { NextRequest, NextResponse } from "next/server";

// Resolves a stable track ID to a currently-valid preview URL.
// Deezer preview URLs are signed with a measured 15-minute lifetime
// (hdnea exp = issue + 900s). The stack must add up phone-side: server
// revalidate + CDN s-maxage + the client's own hold + playback time all
// stack, so each Deezer layer stays at 120s — worst-case URL age at play
// start ≈ 6 minutes, leaving ~9 minutes of life. A `fresh` query param
// (any value) busts the CDN cache for retry-after-failure calls, since a
// "fresh" retry that re-hits the same cached response is no retry at all.
// iTunes preview URLs are unsigned and stable, so they cache long.

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^\d+$/.test(id) || (provider !== "deezer" && provider !== "itunes")) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  const fresh = req.nextUrl.searchParams.has("fresh");
  try {
    let url: string | null = null;
    let cache: string;
    if (provider === "deezer") {
      const res = await fetch(`https://api.deezer.com/track/${id}`, {
        ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 120 } }),
      });
      const track = await res.json();
      url = track?.preview || null;
      cache = fresh ? "no-store" : "public, s-maxage=120, stale-while-revalidate=30";
    } else {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, {
        next: { revalidate: 86400 },
      });
      const data = await res.json();
      url = data?.results?.[0]?.previewUrl || null;
      cache = "public, s-maxage=86400, stale-while-revalidate=3600";
    }
    if (!url) return NextResponse.json({ error: "no preview" }, { status: 404 });
    return NextResponse.json({ url }, { headers: { "Cache-Control": cache } });
  } catch {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
