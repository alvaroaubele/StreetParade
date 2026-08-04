import { NextRequest, NextResponse } from "next/server";

// Resolves a stable track ID to a currently-valid 30s preview URL.
// Deezer preview URLs are signed and expire (~1h), so clients fetch this
// per play instead of storing URLs. CDN-cached well under the expiry.

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^\d+$/.test(id) || (provider !== "deezer" && provider !== "itunes")) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  try {
    let url: string | null = null;
    if (provider === "deezer") {
      const res = await fetch(`https://api.deezer.com/track/${id}`, {
        next: { revalidate: 1200 },
      });
      const track = await res.json();
      url = track?.preview || null;
    } else {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, {
        next: { revalidate: 86400 },
      });
      const data = await res.json();
      url = data?.results?.[0]?.previewUrl || null;
    }
    if (!url) return NextResponse.json({ error: "no preview" }, { status: 404 });
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "public, s-maxage=1200, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
