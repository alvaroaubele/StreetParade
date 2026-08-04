"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadState, saveState } from "@/lib/store";
import { ArtistLinks } from "@/components/ArtistLinks";
import type { DeckCard, SwipeState, VoteTally } from "@/lib/types";

const MIN_VOTES = 10;
const OPTIMAL_VOTES = 40;
type Vote = 1 | -1 | 0;

const bump = (t: VoteTally | undefined, v: Vote): VoteTally => ({
  l: (t?.l ?? 0) + (v === 1 ? 1 : 0),
  n: (t?.n ?? 0) + (v === -1 ? 1 : 0),
  s: (t?.s ?? 0) + (v === 0 ? 1 : 0),
});
const unbump = (t: VoteTally, v: Vote): VoteTally => ({
  l: t.l - (v === 1 ? 1 : 0),
  n: t.n - (v === -1 ? 1 : 0),
  s: t.s - (v === 0 ? 1 : 0),
});

export default function SwipePage() {
  const router = useRouter();
  const [state, setState] = useState<SwipeState | null>(null);
  const [revealed, setRevealed] = useState<{ card: DeckCard; vote: Vote } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [audioErr, setAudioErr] = useState(false);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });
  const [flyOut, setFlyOut] = useState<Vote | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<{ key: string; vote: Vote }[]>([]);
  const urlCache = useRef<Map<string, string>>(new Map());
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const s = loadState();
    if (!s || !s.deck.length) {
      router.replace("/");
      return;
    }
    setState(s);
  }, [router]);

  const card = state && state.position < state.deck.length ? state.deck[state.position] : null;
  const nextCard = state && state.position + 1 < state.deck.length ? state.deck[state.position + 1] : null;

  const previewUrl = useCallback(async (c: DeckCard): Promise<string> => {
    const key = `${c.track.provider}:${c.track.trackId}`;
    const hit = urlCache.current.get(key);
    if (hit) return hit;
    const res = await fetch(`/api/preview?provider=${c.track.provider}&id=${c.track.trackId}`);
    if (!res.ok) throw new Error("no preview");
    const { url } = await res.json();
    urlCache.current.set(key, url);
    return url;
  }, []);

  // Load + try to play the current card's snippet; prefetch the next one.
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
        const url = await previewUrl(card);
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
    if (nextCard) previewUrl(nextCard).catch(() => {});
    return () => {
      cancelled = true;
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.artistKey, card?.track.trackId, revealed === null]);

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

  const vote = useCallback(
    (v: Vote, viaSwipe = false) => {
      if (!state || !card || flyOut !== null) return;
      audioRef.current?.pause();
      setPlaying(false);
      navigator.vibrate?.(v === 0 ? 5 : 15);
      historyRef.current.push({ key: card.artistKey, vote: v });
      const next: SwipeState = {
        ...state,
        votes: { ...state.votes, [card.artistKey]: bump(state.votes[card.artistKey], v) },
        position: state.position + 1,
      };
      saveState(next);
      if (viaSwipe && v !== 0) {
        setFlyOut(v);
        setTimeout(() => {
          setFlyOut(null);
          setDrag({ dx: 0, dy: 0, active: false });
          setState(next);
          setRevealed({ card, vote: v });
        }, 180);
      } else {
        setDrag({ dx: 0, dy: 0, active: false });
        setState(next);
        setRevealed({ card, vote: v });
      }
    },
    [state, card, flyOut]
  );

  const undo = useCallback(() => {
    if (!state || !historyRef.current.length || revealed) return;
    const last = historyRef.current.pop()!;
    const tally = state.votes[last.key];
    if (!tally) return;
    const next: SwipeState = {
      ...state,
      votes: { ...state.votes, [last.key]: unbump(tally, last.vote) },
      position: Math.max(0, state.position - 1),
    };
    saveState(next);
    setState(next);
    navigator.vibrate?.(8);
  }, [state, revealed]);

  // Desktop keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (revealed) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          setRevealed(null);
        }
        return;
      }
      if (e.key === "ArrowRight") vote(1);
      else if (e.key === "ArrowLeft") vote(-1);
      else if (e.key === "ArrowDown" || e.key === "s") vote(0);
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "u" || e.key === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote, undo, togglePlay, revealed]);

  // Drag gestures on the card.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDrag((d) => ({ ...d, active: true }));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setDrag({ dx: e.clientX - dragStart.current.x, dy: e.clientY - dragStart.current.y, active: true });
  };
  const onPointerUp = () => {
    if (!dragStart.current) return;
    const { dx, dy } = dragRef.current;
    dragStart.current = null;
    if (Math.abs(dx) > 80) vote(dx > 0 ? 1 : -1, true);
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) togglePlay();
    else setDrag({ dx: 0, dy: 0, active: false });
  };
  const dragRef = useRef(drag);
  dragRef.current = drag;

  if (!state) return null;

  const votedCount = Object.values(state.votes).filter((t) => t.l + t.n > 0).length;
  const total = state.deck.length;

  // ---------- reveal card ----------
  if (revealed) {
    const { card: c, vote: v } = revealed;
    const done = state.position >= total;
    return (
      <main className="flex min-h-dvh flex-col pt-10 pb-6">
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
          <div className="mt-4">
            <ArtistLinks artistKey={c.artistKey} artistName={c.artistName} />
          </div>
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
            <button onClick={() => router.push("/results")} className="flex-1 rounded-2xl bg-neutral-800 py-4 font-bold transition active:scale-[0.98]">
              My route ({votedCount})
            </button>
          )}
          <button
            onClick={() => (done ? router.push("/results") : setRevealed(null))}
            className="flex-1 rounded-2xl bg-fuchsia-600 py-4 font-bold transition active:scale-[0.98]"
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
        <button onClick={() => router.push("/results")} className="w-full rounded-2xl bg-fuchsia-600 py-4 font-bold">
          Build my route
        </button>
      </main>
    );
  }

  // ---------- blind card ----------
  const rot = drag.dx / 18;
  const likeOpacity = Math.min(1, Math.max(0, drag.dx - 20) / 80);
  const nopeOpacity = Math.min(1, Math.max(0, -drag.dx - 20) / 80);
  const flyX = flyOut === 1 ? 600 : flyOut === -1 ? -600 : drag.dx;

  return (
    <main className="flex min-h-dvh select-none flex-col pt-10 pb-6">
      <Progress votedCount={votedCount} position={state.position} total={total} />
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
      />
      <div className="relative mt-6 flex flex-1 touch-none flex-col items-center justify-center">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            transform: `translate(${flyX}px, ${drag.dy * 0.2}px) rotate(${flyOut ? flyOut * 30 : rot}deg)`,
            transition: drag.active && !flyOut ? "none" : "transform 180ms ease-out",
          }}
          className="relative grid h-64 w-64 cursor-grab place-items-center rounded-full border-8 border-neutral-800 bg-neutral-900 active:cursor-grabbing"
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
          <span
            className="absolute left-4 top-8 -rotate-12 rounded-lg border-2 border-emerald-400 px-2 py-0.5 text-lg font-black text-emerald-400"
            style={{ opacity: likeOpacity }}
          >
            LIKE
          </span>
          <span
            className="absolute right-4 top-8 rotate-12 rounded-lg border-2 border-rose-400 px-2 py-0.5 text-lg font-black text-rose-400"
            style={{ opacity: nopeOpacity }}
          >
            NOPE
          </span>
          <span className="z-10 text-5xl">{audioErr ? "⚠️" : playing ? "❚❚" : "▶"}</span>
        </div>
        <p className="mt-6 px-6 text-center text-sm text-neutral-500">
          {audioErr
            ? "Snippet unavailable — skip this one."
            : needsTap
              ? "Tap the disc to play"
              : "Mystery set — drag right to like, left to nope."}
        </p>
        {historyRef.current.length > 0 && (
          <button onClick={undo} className="mt-3 rounded-full border border-neutral-700 px-4 py-1.5 text-sm text-neutral-400 transition active:scale-95">
            ↩ undo
          </button>
        )}
      </div>
      <div className="mb-2 grid grid-cols-3 gap-3">
        <button onClick={() => vote(-1)} className="rounded-2xl border-2 border-rose-500/60 bg-rose-950/40 py-5 text-lg font-bold text-rose-300 transition active:scale-95">
          Nope
        </button>
        <button onClick={() => vote(0)} className="rounded-2xl border border-neutral-700 bg-neutral-900 py-5 font-semibold text-neutral-400 transition active:scale-95">
          Skip
        </button>
        <button onClick={() => vote(1)} className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/40 py-5 text-lg font-bold text-emerald-300 transition active:scale-95">
          Like
        </button>
      </div>
    </main>
  );
}

function Progress({ votedCount, position, total }: { votedCount: number; position: number; total: number }) {
  const pct = Math.min(100, (votedCount / OPTIMAL_VOTES) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>
          {votedCount < MIN_VOTES
            ? `${votedCount}/${MIN_VOTES} votes to unlock your route`
            : votedCount < OPTIMAL_VOTES
              ? `route unlocked · ${OPTIMAL_VOTES - votedCount} more to the optimal match`
              : "optimal match reached — keep going if you like"}
        </span>
        <span>card {Math.min(position + 1, total)}/{total}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-neutral-500"
          style={{ left: `${(MIN_VOTES / OPTIMAL_VOTES) * 100}%` }}
          title="route unlocks"
        />
      </div>
    </div>
  );
}
