"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, shareText, type Recommendation } from "@/lib/scoring";
import { mapsRouteUrl } from "@/lib/geo";
import { clearState, loadState } from "@/lib/store";
import { ArtistLinks } from "@/components/ArtistLinks";

export default function ResultsPage() {
  const router = useRouter();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const s = loadState();
    if (!s) {
      router.replace("/");
      return;
    }
    const n = Object.values(s.votes).reduce((sum, t) => sum + t.l + t.n + (t.sl ?? 0), 0);
    setVoteCount(n);
    setRec(recommend(s.votes));
  }, [router]);

  if (!rec) return null;

  const liked = rec.ranked.filter((r) => r.direct && r.score > 0);
  const discoveries = rec.ranked.filter((r) => !r.direct && r.score > 0.15).slice(0, 8);
  const topMobiles = rec.mobiles.filter((m) => m.starred || m.score > 0).slice(0, 5);
  const mapsUrl = mapsRouteUrl(rec.timeline.map((b) => b.stage));

  const copyRoute = async () => {
    try {
      await navigator.clipboard.writeText(shareText(rec, voteCount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — nothing to do
    }
  };

  return (
    <main className="flex min-h-dvh flex-col gap-8 pt-10 pb-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-400">
          Your route · 8 Aug 2026
        </p>
        <h1 className="mt-1 text-3xl font-black">Built from {voteCount} blind votes</h1>
        {rec.genreProfile.length > 0 && (
          <p className="mt-2 text-sm text-neutral-400">
            Your sound:{" "}
            {rec.genreProfile.filter(([, s]) => s > 0).slice(0, 4).map(([g]) => g).join(" · ") ||
              "still undecided"}
          </p>
        )}
        {voteCount < 40 && (
          <p className="mt-1 text-xs text-neutral-600">
            Based on {voteCount} votes — 40 gives the best match. You can keep swiping anytime.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={copyRoute}
            className="rounded-2xl border border-fuchsia-700/60 bg-fuchsia-950/30 px-2 py-3 text-sm font-bold text-fuchsia-200 transition active:scale-[0.98]"
          >
            {copied ? "Copied ✓" : "📋 Copy for the chat"}
          </button>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener"
              className="grid place-items-center rounded-2xl border border-sky-700/60 bg-sky-950/30 px-2 py-3 text-sm font-bold text-sky-200 transition active:scale-[0.98]"
            >
              🗺 Open in Google Maps
            </a>
          ) : (
            <div />
          )}
        </div>
        <p className="mt-1.5 text-xs text-neutral-600">
          Map pins are approximate (~100 m) — the official app has exact spots.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-bold">Stage timeline</h2>
        <p className="mt-1 text-sm text-neutral-500">Best fixed-stage set for you at every point of the day.</p>
        <div className="mt-4 space-y-2">
          {rec.timeline.map((b, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                b.locked
                  ? "border-amber-600/60 bg-amber-950/20"
                  : b.score > 1.5
                    ? "border-fuchsia-700/60 bg-fuchsia-950/30"
                    : "border-neutral-800 bg-neutral-900"
              }`}
            >
              <div className="w-24 shrink-0 text-sm font-semibold text-neutral-400">
                {b.from}–{b.to}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.artist}</p>
                <p className="truncate text-sm text-neutral-400">{b.stage}</p>
              </div>
              {b.locked ? <span className="shrink-0">⭐</span> : b.score > 1.5 && <span className="shrink-0">🔥</span>}
            </div>
          ))}
        </div>
      </section>

      {topMobiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">Love Mobiles to catch</h2>
          <p className="mt-1 text-sm text-neutral-500">They roam the route — cross paths during their window.</p>
          <div className="mt-4 space-y-2">
            {topMobiles.map((m) => (
              <div
                key={m.label}
                className={`rounded-xl border p-3 ${
                  m.starred ? "border-amber-600/60 bg-amber-950/20" : "border-neutral-800 bg-neutral-900"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold">{m.starred ? "⭐ " : ""}{m.label}</p>
                  {m.timeWindow && <p className="shrink-0 text-sm text-neutral-400">{m.timeWindow}</p>}
                </div>
                <p className="text-sm text-neutral-500">{m.styles}</p>
                {m.topArtists.length > 0 && (
                  <p className="mt-1 text-sm text-fuchsia-300">for you: {m.topArtists.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {liked.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">You liked, blind</h2>
          <p className="mt-1 text-sm text-neutral-500">Deep-dive them before Saturday.</p>
          <div className="mt-3 space-y-2">
            {liked.map((r) => (
              <ArtistRow key={r.key} artistKey={r.key} name={r.name} sub={appearanceLine(r)} strong />
            ))}
          </div>
        </section>
      )}

      {discoveries.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">Should match your taste</h2>
          <p className="mt-1 text-sm text-neutral-500">Not in your blind test, but they play the styles you liked.</p>
          <div className="mt-3 space-y-2">
            {discoveries.map((r) => (
              <ArtistRow key={r.key} artistKey={r.key} name={r.name} sub={appearanceLine(r)} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-2 flex gap-2">
        <button onClick={() => router.push("/swipe")} className="flex-1 rounded-2xl bg-neutral-800 py-4 font-bold transition active:scale-[0.98]">
          Keep swiping
        </button>
        <button
          onClick={() => {
            clearState();
            router.push("/");
          }}
          className="flex-1 rounded-2xl border border-neutral-700 py-4 font-bold text-neutral-300 transition active:scale-[0.98]"
        >
          Start over
        </button>
      </div>
    </main>
  );
}

function appearanceLine(r: { appearances: { venue: string; time: string | null; timeWindow?: string | null }[] }) {
  return r.appearances
    .map((a) => `${a.venue}${a.time ? ` · ${a.time}` : a.timeWindow ? ` · ${a.timeWindow}` : ""}`)
    .join("  |  ");
}

function ArtistRow({ artistKey, name, sub, strong }: { artistKey: string; name: string; sub: string; strong?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border p-3 ${
        strong ? "border-emerald-800/60 bg-emerald-950/20" : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{name}</p>
          <span className="text-sm text-neutral-500">{open ? "▴" : "listen ▾"}</span>
        </div>
        <p className="text-sm text-neutral-400">{sub}</p>
      </button>
      {open && (
        <div className="mt-3">
          <ArtistLinks artistKey={artistKey} artistName={name} />
        </div>
      )}
    </div>
  );
}
