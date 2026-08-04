"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { welcomeTrack } from "@/lib/data";

// Versioned on purpose: earlier builds could leave a stale mute behind that
// read as "the welcome song is broken". Bumping the key gives everyone one
// fresh unmuted visit; mutes made from here on persist again.
const MUTE_KEY = "parademtach-vibe-muted-v2";
const VIBE_SRC = "/api/vibe";

/**
 * Chill ambience on the landing page: a warm house snippet from the line-up,
 * looped at low volume (element volume — iOS plays at hardware volume, the
 * acceptable trade after the WebAudio route proved fragile).
 *
 * The element's src is our own /api/vibe stream, set once at mount. Same
 * origin, no signed URL, no expiry, no geo-blocked CDN edge — so the gesture
 * path has nothing to resolve and nothing to await.
 *
 * Start order is a cascade against autoplay policy, which no site can beat,
 * only meet: (1) audible from page open where the browser permits it;
 * (2) otherwise muted playback from page open — universally allowed — so the
 * track is already running and the first completed gesture just flips the
 * volume on, mid-groove, with zero start-up latency; (3) if even muted play
 * is refused, the gesture starts playback outright. Interactions keep
 * re-arming until sound is actually audible.
 */
export function WelcomeVibe() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasVibe = useRef(Boolean(welcomeTrack()));
  const userMuted = useRef(false);
  const [muted, setMuted] = useState(true);

  /** Synchronous by design — safe to call directly from gesture handlers.
   * Unmutes as it starts: the element may already be playing silently. */
  const startPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0.3;
    audio.muted = false;
    const ok = () => setMuted(false);
    audio.play().then(ok).catch((err: unknown) => {
      // NotAllowedError means this event carried no user activation (e.g.
      // the tail of a scroll) — leave the element alone; a later gesture
      // will carry it. Anything else is a wedged fetch: load() resets it,
      // and the retry is still inside the gesture, so policy allows it.
      if ((err as DOMException)?.name === "NotAllowedError") return;
      audio.load();
      audio.play().then(ok).catch(() => {});
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!hasVibe.current || !audio) return;
    const wantsMute = localStorage.getItem(MUTE_KEY) === "1";
    userMuted.current = wantsMute;
    setMuted(wantsMute);
    audio.src = VIBE_SRC;
    audio.loop = true;
    audio.volume = 0.3;
    audio.preload = "auto";
    if (wantsMute) return; // src is set, so the toggle can start it later

    const start = () => {
      if (!userMuted.current) startPlayback();
    };
    // Completed-gesture events only: WebKit withholds user activation at
    // pointerdown (the finger might be starting a scroll) and grants it at
    // gesture completion — which is why the mute toggle's click always
    // worked while taps elsewhere stayed silent on iPhones. keydown is the
    // exception: it activates everywhere.
    const gestures = ["pointerup", "click", "touchend", "keydown"] as const;
    const detach = () => {
      for (const g of gestures) window.removeEventListener(g, start);
    };
    // Detach only once AUDIBLE: the muted warm start also fires "playing",
    // and the gesture unmute arrives as "volumechange" — either event may
    // complete the pair (playing && unmuted).
    const sync = () => {
      if (audio.muted || audio.paused) return;
      setMuted(false);
      detach();
    };
    audio.addEventListener("playing", sync);
    audio.addEventListener("volumechange", sync);
    // (1) Audible from page open where the browser permits it…
    audio.muted = false;
    audio
      .play()
      .then(() => setMuted(false))
      .catch(() => {
        // (2) …else warm-start silently — allowed everywhere — so the first
        // gesture unmutes a track that is already mid-flow.
        audio.muted = true;
        audio.play().catch(() => {
          // (3) even muted play refused — the gesture will start it cold.
        });
      });
    // Every interaction is a fresh chance until sound is audible.
    for (const g of gestures) window.addEventListener(g, start);
    return () => {
      audio.removeEventListener("playing", sync);
      audio.removeEventListener("volumechange", sync);
      detach();
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      localStorage.removeItem(MUTE_KEY);
      userMuted.current = false;
      startPlayback(); // in-gesture: the click itself authorizes playback
    } else {
      localStorage.setItem(MUTE_KEY, "1");
      userMuted.current = true;
      setMuted(true);
      audio.pause();
    }
  };

  if (!hasVibe.current) return null;
  return (
    <>
      <audio ref={audioRef} data-vibe />
      <button
        onClick={toggle}
        aria-label={muted ? "unmute ambience" : "mute ambience"}
        aria-pressed={!muted}
        className="fixed right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-neutral-700 bg-neutral-900/90 backdrop-blur transition active:scale-95"
      >
        {muted ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-neutral-400" aria-hidden>
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 3.2 3.2-1.4 1.4-3.2-3.2-3.2 3.2-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4 3.2 3.2 3.2-3.2 1.4 1.4L16.6 12z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-fuchsia-300" aria-hidden>
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z" />
          </svg>
        )}
      </button>
    </>
  );
}
