"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recommend, shareText, type Recommendation } from "@/lib/scoring";
import { mapsRouteUrl } from "@/lib/geo";
import { clearState, countVotes, loadState } from "@/lib/store";
import { ArtistLinks } from "@/components/ArtistLinks";

const EVENT_DAY = "2026-08-08";

/** Minutes since midnight, only meaningful on parade day. */
function nowMinutesOnEventDay(): number | null {
  const now = new Date();
  const zurich = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => zurich.find((p) => p.type === t)?.value ?? "";
  if (`${get("year")}-${get("month")}-${get("day")}` !== EVENT_DAY) return null;
  return Number(get("hour")) * 60 + Number(get("minute"));
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h === 0 ? 24 : h) * 60 + m;
};

export default function ResultsPage() {
  const router = useRouter();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "done" | "failed">("idle");
  const nowRef = useRef<HTMLDivElement | null>(null);
  const [nowMin] = useState<number | null>(nowMinutesOnEventDay);

  useEffect(() => {
    const s = loadState();
    if (!s) {
      router.replace("/");
      return;
    }
    const n = countVotes(s.votes);
    setVoteCount(n);
    if (n === 0) {
      setEmpty(true);
      return;
    }
    setRec(recommend(s.votes));
  }, [router]);

  useEffect(() => {
    if (rec && nowRef.current) nowRef.current.scrollIntoView({ block: "center" });
  }, [rec]);

  if (empty) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-black">No votes yet</h1>
        <p className="text-neutral-300">
          Your route is built from your likes and nopes — do the blind test first.
        </p>
        <button onClick={() => router.push("/swipe")} className="w-full rounded-2xl bg-fuchsia-600 py-4 font-bold">
          Start swiping
        </button>
        <button onClick={() => router.push("/")} className="w-full rounded-2xl bg-neutral-800 py-4 font-bold">
          Adjust filters
        </button>
      </main>
    );
  }

  if (!rec) return null;

  const liked = rec.ranked.filter((r) => r.direct && r.score > 0);
  const discoveries = rec.ranked.filter((r) => !r.direct && r.score > 0.15).slice(0, 8);
  const topMobiles = rec.mobiles.filter((m) => m.starred || m.score > 0).slice(0, 5);
  const mapsUrl = mapsRouteUrl(rec.timeline.map((b) => b.stage));

  const share = async () => {
    const text = shareText(rec, voteCount, {
      mapsUrl,
      appUrl: typeof location !== "undefined" ? location.origin : undefined,
    });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShareState("done");
      } else {
        await navigator.clipboard.writeText(text);
        setShareState("done");
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // user closed the sheet
      try {
        await navigator.clipboard.writeText(text);
        setShareState("done");
      } catch {
        setShareState("failed");
      }
    }
    setTimeout(() => setShareState("idle"), 2500);
  };

  const isNow = (from: string, to: string) =>
    nowMin !== null && toMin(from) <= nowMin && nowMin < toMin(to);

  return (
    <main className="flex min-h-dvh flex-col gap-8 pt-10 pb-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-400">
          Your route · 8 Aug 2026
        </p>
        <h1 className="mt-1 text-3xl font-black">Built from {voteCount} blind votes</h1>
        {rec.genreProfile.length > 0 && (
          <p className="mt-2 text-sm text-neutral-300">
            Your sound:{" "}
            {rec.genreProfile.filter(([, s]) => s > 0).slice(0, 4).map(([g]) => g).join(" · ") ||
              "still undecided"}
          </p>
        )}
        {voteCount < 40 && (
          <p className="mt-1 text-sm text-neutral-400">
            Based on {voteCount} votes — 40 gives the best match. You can keep swiping anytime.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={share}
            className={`rounded-2xl border px-2 py-3 text-sm font-bold transition active:scale-[0.98] ${
              shareState === "failed"
                ? "border-rose-600/60 bg-rose-950/30 text-rose-200"
                : "border-fuchsia-700/60 bg-fuchsia-950/30 text-fuchsia-200"
            }`}
          >
            {shareState === "done" ? "Shared ✓" : shareState === "failed" ? "Couldn't share — try your browser menu" : "Share to the group chat"}
          </button>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener"
              className="grid place-items-center rounded-2xl border border-sky-700/60 bg-sky-950/30 px-2 py-3 text-sm font-bold text-sky-200 transition active:scale-[0.98]"
            >
              Open in Google Maps
            </a>
          ) : (
            <div />
          )}
        </div>
        <p className="mt-1.5 text-sm text-neutral-400">
          Map: each of your stages once, walking order. Pins approximate (~100 m).
        </p>
      </header>

      <section>
        <h2 className="text-xl font-bold">Stage timeline</h2>
        <p className="mt-1 text-sm text-neutral-400">Best fixed-stage set for you at every point of the day.</p>
        <div className="mt-4 space-y-2">
          {rec.timeline.map((b, i) => {
            const current = isNow(b.from, b.to);
            return (
              <div
                key={i}
                ref={current ? nowRef : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  current
                    ? "border-fuchsia-400 bg-fuchsia-950/40 ring-2 ring-fuchsia-500/60"
                    : b.locked
                      ? "border-amber-600/60 bg-amber-950/20"
                      : b.score > 1.5
                        ? "border-fuchsia-700/60 bg-fuchsia-950/30"
                        : "border-neutral-800 bg-neutral-900"
                }`}
              >
                <div className="w-24 shrink-0 text-sm font-semibold text-neutral-300">
                  {b.from}–{b.to}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{b.artist}</p>
                  <p className="truncate text-sm text-neutral-400">{b.stage}</p>
                </div>
                {current && (
                  <span className="shrink-0 rounded-full bg-fuchsia-500 px-2 py-0.5 text-xs font-bold">NOW</span>
                )}
                {b.locked ? <span className="shrink-0">⭐</span> : b.score > 1.5 && <span className="shrink-0">🔥</span>}
              </div>
            );
          })}
        </div>
      </section>

      {topMobiles.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">Love Mobiles to catch</h2>
          <p className="mt-1 text-sm text-neutral-400">They roam the route — cross paths during their window.</p>
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
                  {m.timeWindow && <p className="shrink-0 text-sm text-neutral-300">{m.timeWindow}</p>}
                </div>
                <p className="text-sm text-neutral-400">{m.styles}</p>
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
          <p className="mt-1 text-sm text-neutral-400">Deep-dive them before Saturday.</p>
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
          <p className="mt-1 text-sm text-neutral-400">Not in your blind test, but they play the styles you liked.</p>
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
        <StartOverButton
          onConfirm={() => {
            clearState();
            router.push("/");
          }}
        />
      </div>
    </main>
  );
}

/** Two-tap confirm: a stray tap must not erase up to 50 votes. */
function StartOverButton({ onConfirm }: { onConfirm: () => void }) {
  const [arm, setArm] = useState(false);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(false), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  return (
    <button
      onClick={() => (arm ? onConfirm() : setArm(true))}
      className={`flex-1 rounded-2xl border py-4 font-bold transition active:scale-[0.98] ${
        arm ? "border-rose-600 bg-rose-950/40 text-rose-200" : "border-neutral-700 text-neutral-300"
      }`}
    >
      {arm ? "Tap again to erase votes" : "Start over"}
    </button>
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
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{name}</p>
          <span className="text-sm text-neutral-400">{open ? "▴" : "listen ▾"}</span>
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
