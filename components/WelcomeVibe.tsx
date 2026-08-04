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
 * path has nothing to resolve and nothing to await: mobile autoplay policy
 * only trusts play() calls made synchronously inside the gesture, and that
 * is exactly what it gets. Interactions keep re-arming until sound actually
 * starts, so one flaky network moment doesn't mean permanent silence.
 */
export function WelcomeVibe() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasVibe = useRef(Boolean(welcomeTrack()));
  const userMuted = useRef(false);
  const [muted, setMuted] = useState(true);

  /** Synchronous by design — safe to call directly from gesture handlers. */
  const startPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0.3;
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
    const onPlaying = () => {
      setMuted(false);
      detach();
    };
    audio.addEventListener("playing", onPlaying);
    // Free autoplay where the browser allows it (desktop mostly)…
    audio.play().catch(() => {});
    // …and every interaction is a fresh chance until sound actually starts.
    for (const g of gestures) window.addEventListener(g, start);
    return () => {
      audio.removeEventListener("playing", onPlaying);
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
