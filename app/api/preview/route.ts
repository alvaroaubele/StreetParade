import { NextRequest, NextResponse } from "next/server";

// Resolves a stable track ID to a currently-valid preview URL.
// Deezer preview URLs are signed with a measured 15-minute lifetime
// (hdnea exp = issue + 900s), so every caching layer here stays well under
// that: 300s server-side revalidate + 300s CDN s-maxage leaves a fresh URL
// at least ~5 minutes of playable life in the worst stacking case. iTunes
// preview URLs are unsigned and stable, so they cache long.

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^\d+$/.test(id) || (provider !== "deezer" && provider !== "itunes")) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  try {
    let url: string | null = null;
    let cache: string;
    if (provider === "deezer") {
      const res = await fetch(`https://api.deezer.com/track/${id}`, {
        next: { revalidate: 300 },
      });
      const track = await res.json();
      url = track?.preview || null;
      cache = "public, s-maxage=300, stale-while-revalidate=60";
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
