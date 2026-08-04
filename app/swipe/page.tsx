"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadState, saveState } from "@/lib/store";
import type { DeckCard, SwipeState, Vote } from "@/lib/types";

const MIN_VOTES = 10;

export default function SwipePage() {
  const router = useRouter();
  const [state, setState] = useState<SwipeState | null>(null);
  const [revealed, setRevealed] = useState<{ card: DeckCard; vote: Vote } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [audioErr, setAudioErr] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const s = loadState();
    if (!s || !s.deck.length) {
      router.replace("/");
      return;
    }
    setState(s);
  }, [router]);

  const card = state && state.position < state.deck.length ? state.deck[state.position] : null;

  // Load + try to play the current card's snippet.
  useEffect(() => {
    if (!card || revealed) return;
    let cancelled = false;
    setAudioErr(false);
    setProgress(0);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    (async () => {
      try {
        const res = await fetch(
          `/api/preview?provider=${card.track.provider}&id=${card.track.trackId}`
        );
        if (!res.ok) throw new Error();
        const { url } = await res.json();
        if (cancelled) return;
        audio.src = url;
        try {
          await audio.play();
          setPlaying(true);
          setNeedsTap(false);
        } catch {
          setPlaying(false);
          setNeedsTap(true); // mobile autoplay policy — one tap needed
        }
      } catch {
        if (!cancelled) setAudioErr(true);
      }
    })();
    return () => {
      cancelled = true;
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.artistKey, revealed === null]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio.play().then(() => {
        setPlaying(true);
        setNeedsTap(false);
      });
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const vote = (v: Vote) => {
    if (!state || !card) return;
    audioRef.current?.pause();
    setPlaying(false);
    const next: SwipeState = {
      ...state,
      votes: { ...state.votes, [card.artistKey]: v },
      position: state.position + 1,
    };
    saveState(next);
    setState(next);
    setRevealed({ card, vote: v });
  };

  if (!state) return null;

  const votedCount = Object.values(state.votes).filter((v) => v !== 0).length;
  const total = state.deck.length;

  // ---------- reveal card ----------
  if (revealed) {
    const { card: c, vote: v } = revealed;
    const done = state.position >= total;
    return (
      <main className="flex min-h-dvh flex-col pt-10">
        <Progress votedCount={votedCount} position={state.position} total={total} />
        <div className="mt-6 flex-1 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <p
            className={`text-sm font-bold uppercase tracking-widest ${
              v === 1 ? "text-emerald-400" : v === -1 ? "text-rose-400" : "text-neutral-500"
            }`}
          >
            {v === 1 ? "Liked" : v === -1 ? "Not for you" : "Skipped"} — it was
          </p>
          <h2 className="mt-2 text-3xl font-black">{c.artistName}</h2>
          <p className="mt-1 text-lg text-neutral-300">“{c.track.title}”</p>
          <a
            href={`https://duckduckgo.com/?q=${encodeURIComponent(c.artistName + " DJ")}`}
            target="_blank"
            rel="noopener"
            className="mt-1 inline-block text-sm text-fuchsia-400"
          >
            search the artist ↗
          </a>
          <div className="mt-5 space-y-2">
            {c.appearances.map((a, i) => (
              <div key={i} className="rounded-xl bg-neutral-800/60 p-3 text-sm">
                <p className="font-semibold">{a.venue}</p>
                <p className="text-neutral-400">
                  {a.time
                    ? `Set at ${a.time}`
                    : a.venueType === "mobile"
                      ? `Roaming${a.timeWindow ? ` · on route ${a.timeWindow}` : ""}`
                      : "Time TBA"}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.genres.map((g) => (
              <span key={g} className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
                {g}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {votedCount >= MIN_VOTES && (
            <button
              onClick={() => router.push("/results")}
              className="flex-1 rounded-2xl bg-neutral-800 py-4 font-bold"
            >
              My route ({votedCount})
            </button>
          )}
          <button
            onClick={() => (done ? router.push("/results") : setRevealed(null))}
            className="flex-1 rounded-2xl bg-fuchsia-600 py-4 font-bold"
          >
            {done ? "Finish → my route" : "Next snippet"}
          </button>
        </div>
      </main>
    );
  }

  // ---------- deck exhausted ----------
  if (!card) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-2xl font-black">Deck complete</h2>
        <p className="text-neutral-400">{votedCount} votes in.</p>
        <button
          onClick={() => router.push("/results")}
          className="w-full rounded-2xl bg-fuchsia-600 py-4 font-bold"
        >
          Build my route
        </button>
      </main>
    );
  }

  // ---------- blind card ----------
  return (
    <main className="flex min-h-dvh flex-col pt-10">
      <Progress votedCount={votedCount} position={state.position} total={total} />
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
      />
      <div className="mt-6 flex flex-1 flex-col items-center justify-center">
        <button
          onClick={togglePlay}
          aria-label={playing ? "pause" : "play"}
          className="relative grid h-56 w-56 place-items-center rounded-full border-8 border-neutral-800 bg-neutral-900"
        >
          <div
            className={`absolute inset-3 rounded-full border border-neutral-700/60 bg-[repeating-radial-gradient(circle_at_center,#18181f_0px,#18181f_3px,#101016_4px)] spin-slow ${
              playing ? "" : "spin-paused"
            }`}
          />
          <div className="absolute inset-0 -rotate-90">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <circle
                cx="50" cy="50" r="47" fill="none" stroke="#d946ef" strokeWidth="3"
                strokeDasharray={`${progress * 295} 295`} strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="z-10 text-5xl">
            {audioErr ? "⚠️" : playing ? "❚❚" : "▶"}
          </span>
        </button>
        <p className="mt-6 text-center text-neutral-500">
          {audioErr
            ? "Snippet unavailable — skip this one."
            : needsTap
              ? "Tap the disc to play"
              : "Mystery set. Would you dance to this?"}
        </p>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-3">
        <button
          onClick={() => vote(-1)}
          className="rounded-2xl border-2 border-rose-500/60 bg-rose-950/40 py-5 text-lg font-bold text-rose-300"
        >
          Nope
        </button>
        <button
          onClick={() => vote(0)}
          className="rounded-2xl border border-neutral-700 bg-neutral-900 py-5 font-semibold text-neutral-400"
        >
          Skip
        </button>
        <button
          onClick={() => vote(1)}
          className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/40 py-5 text-lg font-bold text-emerald-300"
        >
          Like
        </button>
      </div>
    </main>
  );
}

function Progress({ votedCount, position, total }: { votedCount: number; position: number; total: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>
          {votedCount} vote{votedCount === 1 ? "" : "s"}
          {votedCount < MIN_VOTES ? ` · ${MIN_VOTES - votedCount} to unlock route` : " · route unlocked"}
        </span>
        <span>
          card {Math.min(position + 1, total)}/{total}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded bg-neutral-800">
        <div
          className="h-full bg-fuchsia-500 transition-all"
          style={{ width: `${(position / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
