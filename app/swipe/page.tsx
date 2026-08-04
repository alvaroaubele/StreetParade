"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { catalog, welcomeTrack } from "@/lib/data";
import { countVotes, loadState, saveState } from "@/lib/store";
import { ArtistLinks } from "@/components/ArtistLinks";
import type { CatalogTrack, DeckCard, SwipeState, VoteTally } from "@/lib/types";

const MIN_VOTES = 10;
const OPTIMAL_VOTES = 40;
/** Deezer preview URLs live 15 min; re-resolve well before that. */
const URL_TTL_MS = 5 * 60 * 1000;
/** 1 like · -1 nope · 0 skip · 2 superlike (locks artist into the route) */
type Vote = 1 | -1 | 0 | 2;

const bump = (t: VoteTally | undefined, v: Vote): VoteTally => ({
  l: (t?.l ?? 0) + (v === 1 ? 1 : 0),
  n: (t?.n ?? 0) + (v === -1 ? 1 : 0),
  s: (t?.s ?? 0) + (v === 0 ? 1 : 0),
  sl: (t?.sl ?? 0) + (v === 2 ? 1 : 0),
});
const unbump = (t: VoteTally, v: Vote): VoteTally => ({
  l: t.l - (v === 1 ? 1 : 0),
  n: t.n - (v === -1 ? 1 : 0),
  s: t.s - (v === 0 ? 1 : 0),
  sl: (t.sl ?? 0) - (v === 2 ? 1 : 0),
});

function PlayIcon({ playing, error }: { playing: boolean; error: boolean }) {
  if (error)
    return (
      <svg viewBox="0 0 24 24" className="z-10 h-12 w-12 fill-amber-400" aria-hidden>
        <path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z" />
      </svg>
    );
  return playing ? (
    <svg viewBox="0 0 24 24" className="z-10 h-12 w-12 fill-neutral-200" aria-hidden>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="z-10 h-12 w-12 fill-neutral-200" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

export default function SwipePage() {
  const router = useRouter();
  const [state, setState] = useState<SwipeState | null>(null);
  const [revealed, setRevealed] = useState<{ card: DeckCard; vote: Vote } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [audioErr, setAudioErr] = useState(false);
  const [progress, setProgress] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });
  const [flyOut, setFlyOut] = useState<Vote | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCache = useRef<Map<string, { url: string; at: number }>>(new Map());
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

  const resolveUrl = useCallback(async (track: CatalogTrack, fresh = false): Promise<string> => {
    const key = `${track.provider}:${track.trackId}`;
    const hit = urlCache.current.get(key);
    if (!fresh && hit && Date.now() - hit.at < URL_TTL_MS) return hit.url;
    const res = await fetch(`/api/preview?provider=${track.provider}&id=${track.trackId}`);
    if (!res.ok) {
      urlCache.current.delete(key);
      throw new Error("no preview");
    }
    const { url } = await res.json();
    urlCache.current.set(key, { url, at: Date.now() });
    return url;
  }, []);

  /** Other deck-eligible tracks of the same artist, for when a snippet is
   * dead. The welcome-vibe track is excluded — playing it would break the
   * blind (everyone has heard it on the landing page). */
  const siblingTracks = useCallback((c: DeckCard): CatalogTrack[] => {
    const all = catalog.artists[c.artistKey]?.tracks ?? [];
    const welcome = welcomeTrack();
    return all.filter(
      (t) =>
        `${t.provider}:${t.trackId}` !== `${c.track.provider}:${c.track.trackId}` &&
        !(welcome && t.provider === welcome.track.provider && t.trackId === welcome.track.trackId)
    );
  }, []);

  const swapCardTrack = useCallback((track: CatalogTrack) => {
    setState((s) => {
      if (!s) return s;
      const deck = [...s.deck];
      deck[s.position] = { ...deck[s.position], track };
      const next = { ...s, deck };
      saveState(next);
      return next;
    });
  }, []);

  // Load + play the current snippet. A failing track gets one fresh re-resolve
  // (expired-URL case) before falling back to the artist's other tracks.
  // Runs on position change even while the reveal is up, so the next snippet
  // is already playing when the reveal is dismissed.
  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    setAudioErr(false);
    setProgress(0);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();

    const loadAndPlay = async (url: string): Promise<boolean> => {
      if (cancelled) return true;
      const loaded = new Promise<boolean>((resolve) => {
        const ok = () => { cleanup(); resolve(true); };
        const bad = () => { cleanup(); resolve(false); };
        const cleanup = () => {
          audio.removeEventListener("canplay", ok);
          audio.removeEventListener("error", bad);
        };
        audio.addEventListener("canplay", ok);
        audio.addEventListener("error", bad);
        setTimeout(() => { cleanup(); resolve(audio.readyState >= 2); }, 8000);
      });
      audio.src = url;
      audio.load();
      if (!(await loaded)) return false;
      if (cancelled) return true;
      try {
        await audio.play();
        setPlaying(true);
        setNeedsTap(false);
      } catch {
        setPlaying(false);
        setNeedsTap(true); // mobile autoplay policy — one tap needed
      }
      return true;
    };

    const tryTrack = async (track: CatalogTrack): Promise<boolean> => {
      try {
        if (await loadAndPlay(await resolveUrl(track))) return true;
      } catch {}
      if (cancelled) return true;
      // Cached URL may have expired — one forced fresh resolve, then give up.
      try {
        if (await loadAndPlay(await resolveUrl(track, true))) return true;
      } catch {}
      return false;
    };

    (async () => {
      if (await tryTrack(card.track)) return;
      for (const t of siblingTracks(card)) {
        if (cancelled) return;
        if (await tryTrack(t)) {
          if (!cancelled) swapCardTrack(t);
          return;
        }
      }
      if (!cancelled) setAudioErr(true);
    })();
    if (nextCard) resolveUrl(nextCard.track).catch(() => {});
    return () => {
      cancelled = true;
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.artistKey, card?.track.trackId]);

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
      const before = countVotes(state.votes);
      const next: SwipeState = {
        ...state,
        votes: { ...state.votes, [card.artistKey]: bump(state.votes[card.artistKey], v) },
        position: state.position + 1,
        history: [...(state.history ?? []), { key: card.artistKey, vote: v }],
      };
      const after = countVotes(next.votes);
      if (before < MIN_VOTES && after >= MIN_VOTES) {
        setCelebrate(true);
        navigator.vibrate?.([30, 50, 30]);
        setTimeout(() => setCelebrate(false), 2600);
      } else {
        navigator.vibrate?.(v === 0 ? 5 : v === 2 ? [10, 40, 20] : 15);
      }
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

  // Undo works from the blind card AND the reveal (that's where mis-swipes
  // become visible). History persists in state, so it survives remounts.
  const undo = useCallback(() => {
    if (!state || flyOut !== null) return;
    const history = state.history ?? [];
    if (!history.length) return;
    const last = history[history.length - 1];
    const tally = state.votes[last.key];
    if (!tally) return;
    const next: SwipeState = {
      ...state,
      votes: { ...state.votes, [last.key]: unbump(tally, last.vote) },
      position: Math.max(0, state.position - 1),
      history: history.slice(0, -1),
    };
    saveState(next);
    setState(next);
    setRevealed(null);
    navigator.vibrate?.(8);
  }, [state, flyOut]);

  // Desktop keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (revealed) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          setRevealed(null);
        } else if (e.key === "u" || e.key === "z") undo();
        return;
      }
      if (e.key === "ArrowRight") vote(1);
      else if (e.key === "ArrowLeft") vote(-1);
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        vote(2);
      } else if (e.key === "ArrowDown" || e.key === "s") vote(0);
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "u" || e.key === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote, undo, togglePlay, revealed]);

  // Drag gestures: right = like, left = nope, up = superlike.
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
    if (dy < -80 && Math.abs(dy) > Math.abs(dx)) vote(2, true);
    else if (Math.abs(dx) > 80) vote(dx > 0 ? 1 : -1, true);
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) togglePlay();
    else setDrag({ dx: 0, dy: 0, active: false });
  };
  const dragRef = useRef(drag);
  dragRef.current = drag;

  if (!state) return null;

  const votedCount = countVotes(state.votes);
  const total = state.deck.length;
  const hasHistory = (state.history ?? []).length > 0;

  // One audio element mounted in every branch, always at the same tree
  // position, so React reuses the DOM node across reveal/blind/done
  // switches. If it lived only inside the blind branch, the next card's
  // load effect would fire while the reveal is up — into a null ref — and
  // every snippet after the first would stay silent.
  const audioEl = (
    <audio
      ref={audioRef}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={(e) => {
        const a = e.currentTarget;
        if (a.duration) setProgress(a.currentTime / a.duration);
      }}
    />
  );

  // ---------- reveal card ----------
  if (revealed) {
    const { card: c, vote: v } = revealed;
    const done = state.position >= total;
    return (
      <>
      {audioEl}
      <main className="flex min-h-dvh flex-col pt-10 pb-6">
        <Progress votedCount={votedCount} celebrate={celebrate} />
        <div
          onClick={() => !done && setRevealed(null)}
          className={`mt-6 flex-1 cursor-pointer rounded-3xl border p-6 ${
            v === 2 ? "border-amber-500/60 bg-amber-950/15" : "border-neutral-800 bg-neutral-900"
          }`}
          aria-live="polite"
        >
          {celebrate && (
            <p className="mb-3 rounded-xl border border-fuchsia-500/60 bg-fuchsia-950/40 p-3 text-center text-sm font-bold text-fuchsia-200">
              🎉 Route unlocked — keep going, it gets sharper to 40
            </p>
          )}
          <p
            className={`text-sm font-bold uppercase tracking-widest ${
              v === 2 ? "text-amber-400" : v === 1 ? "text-emerald-400" : v === -1 ? "text-rose-400" : "text-neutral-400"
            }`}
          >
            {v === 2 ? "⭐ Superliked — locked into your route. It was" : v === 1 ? "Liked — it was" : v === -1 ? "Not for you — it was" : "Skipped — it was"}
          </p>
          <h2 className="mt-2 text-3xl font-black">{c.artistName}</h2>
          <p className="mt-1 text-lg text-neutral-300">“{c.track.title}”</p>
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
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
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {c.genres.map((g) => (
              <span key={g} className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
                {g}
              </span>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                undo();
              }}
              className="ml-auto rounded-full border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 transition active:scale-95"
            >
              Undo vote
            </button>
          </div>
          {!done && <p className="mt-4 text-center text-sm text-neutral-400">next snippet is already playing — tap to continue</p>}
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
      </>
    );
  }

  // ---------- deck exhausted ----------
  if (!card) {
    return (
      <>
      {audioEl}
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-2xl font-black">Deck complete</h2>
        <p className="text-neutral-300">{votedCount} votes in.</p>
        {votedCount >= 1 ? (
          <button onClick={() => router.push("/results")} className="w-full rounded-2xl bg-fuchsia-600 py-4 font-bold">
            Build my route
          </button>
        ) : (
          <>
            <p className="text-sm text-neutral-400">No votes yet — a route needs at least a few likes or nopes.</p>
            <button onClick={() => router.push("/")} className="w-full rounded-2xl bg-fuchsia-600 py-4 font-bold">
              Back to filters
            </button>
          </>
        )}
      </main>
      </>
    );
  }

  // ---------- blind card ----------
  const rot = drag.dx / 18;
  const likeOpacity = Math.min(1, Math.max(0, drag.dx - 20) / 80);
  const nopeOpacity = Math.min(1, Math.max(0, -drag.dx - 20) / 80);
  const superOpacity = Math.min(1, Math.max(0, -drag.dy - 20) / 80) * (Math.abs(drag.dy) > Math.abs(drag.dx) ? 1 : 0);
  const flyX = flyOut === 1 ? 600 : flyOut === -1 ? -600 : drag.dx;
  const flyY = flyOut === 2 ? -800 : drag.dy * 0.2;

  return (
    <>
    {audioEl}
    <main className="flex min-h-dvh select-none flex-col pt-10 pb-6">
      <Progress votedCount={votedCount} celebrate={celebrate} />
      <div className="relative mt-6 flex flex-1 touch-none flex-col items-center justify-center">
        <div
          role="button"
          tabIndex={0}
          aria-label={audioErr ? "snippet unavailable" : playing ? "pause snippet" : "play snippet"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            transform: `translate(${flyX}px, ${flyY}px) rotate(${flyOut === 1 ? 30 : flyOut === -1 ? -30 : rot}deg)`,
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
          <span
            className="absolute bottom-8 rounded-lg border-2 border-amber-400 px-2 py-0.5 text-lg font-black text-amber-400"
            style={{ opacity: superOpacity }}
          >
            ⭐ SUPER
          </span>
          <PlayIcon playing={playing} error={audioErr} />
        </div>
        <p className="mt-6 px-6 text-center text-sm text-neutral-400">
          {audioErr
            ? "No playable snippet for this one — skip it."
            : needsTap
              ? "Tap the disc to play"
              : "Drag right to like, left to nope, up to ⭐ lock into your route."}
        </p>
        {hasHistory && (
          <button onClick={undo} className="mt-3 rounded-full border border-neutral-600 px-4 py-2 text-sm text-neutral-300 transition active:scale-95">
            Undo last vote
          </button>
        )}
      </div>
      <div className="mb-2 grid grid-cols-4 gap-2">
        <button onClick={() => vote(-1)} className="rounded-2xl border-2 border-rose-500/60 bg-rose-950/40 py-5 font-bold text-rose-300 transition active:scale-95">
          Nope
        </button>
        <button onClick={() => vote(0)} className="rounded-2xl border border-neutral-700 bg-neutral-900 py-5 text-sm font-semibold text-neutral-400 transition active:scale-95">
          Skip
        </button>
        <button onClick={() => vote(2)} className="rounded-2xl border-2 border-amber-500/60 bg-amber-950/30 py-5 text-xl transition active:scale-95" aria-label="Superlike — lock into route">
          ⭐
        </button>
        <button onClick={() => vote(1)} className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/40 py-5 font-bold text-emerald-300 transition active:scale-95">
          Like
        </button>
      </div>
    </main>
    </>
  );
}

function Progress({ votedCount, celebrate }: { votedCount: number; celebrate: boolean }) {
  const pct = Math.min(100, (votedCount / OPTIMAL_VOTES) * 100);
  return (
    <div>
      <div className="text-sm text-neutral-400">
        {votedCount < MIN_VOTES
          ? `${votedCount}/${MIN_VOTES} votes to unlock your route`
          : votedCount < OPTIMAL_VOTES
            ? `route unlocked · ${OPTIMAL_VOTES - votedCount} more to the optimal match`
            : "optimal match reached — keep going if you like"}
      </div>
      <div
        role="progressbar"
        aria-valuenow={votedCount}
        aria-valuemin={0}
        aria-valuemax={OPTIMAL_VOTES}
        aria-label="votes toward optimal match"
        className={`relative mt-1.5 h-1.5 overflow-hidden rounded bg-neutral-800 ${celebrate ? "ring-2 ring-fuchsia-400" : ""}`}
      >
        <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-neutral-400" style={{ left: `${(MIN_VOTES / OPTIMAL_VOTES) * 100}%` }} />
      </div>
    </div>
  );
}
