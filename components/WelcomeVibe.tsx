"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { welcomeTrack } from "@/lib/data";

const MUTE_KEY = "parademtach-vibe-muted";
/** Deezer preview URLs die ~15 min after issue and arrive minutes old via
 * the CDN; past this age we re-resolve before trying to play. */
const STALE_MS = 2 * 60 * 1000;

/**
 * Chill ambience on the landing page: a warm house snippet from the line-up,
 * looped at low volume (element volume — iOS plays at hardware volume, the
 * acceptable trade after the WebAudio route proved fragile).
 *
 * Timing matters more than plumbing here: the URL resolves at page load but
 * the first tap may come minutes later, past the URL's life. So the gesture
 * path re-resolves (cache-busted) when the URL is stale or a play fails,
 * and the in-gesture play() attempt "blesses" the element first so the
 * post-await retry is still allowed by mobile autoplay policy.
 */
export function WelcomeVibe() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<{ url: string; at: number } | null>(null);
  const trackRef = useRef(welcomeTrack());
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  const resolve = useCallback(async (fresh = false): Promise<string | null> => {
    const vibe = trackRef.current;
    if (!vibe) return null;
    if (!fresh && urlRef.current && Date.now() - urlRef.current.at < STALE_MS)
      return urlRef.current.url;
    const bust = fresh ? `&fresh=${Date.now()}` : "";
    const res = await fetch(
      `/api/preview?provider=${vibe.track.provider}&id=${vibe.track.trackId}${bust}`
    );
    if (!res.ok) return null;
    const { url } = await res.json();
    urlRef.current = { url, at: Date.now() };
    return url;
  }, []);

  /** Play with freshness: stale src → re-resolve; failed play → one fresh
   * retry. Safe to call from gesture handlers and the toggle alike. */
  const startPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    // Bless the element inside the gesture so later awaited plays are allowed.
    audio.play().catch(() => {});
    try {
      let url = await resolve();
      if (!url) return;
      if (audio.src !== url) {
        audio.src = url;
        audio.loop = true;
        audio.volume = 0.3;
      }
      try {
        await audio.play();
        setMuted(false);
        return;
      } catch {}
      // Stale or dead URL — one truly fresh retry.
      url = await resolve(true);
      if (!url) return;
      audio.src = url;
      audio.loop = true;
      audio.volume = 0.3;
      await audio.play();
      setMuted(false);
    } catch {
      // Still blocked or unreachable — the page works silent.
    }
  }, [resolve]);

  useEffect(() => {
    const wantsMute = localStorage.getItem(MUTE_KEY) === "1";
    setMuted(wantsMute);
    const audio = audioRef.current;
    if (!trackRef.current || !audio) return;

    let cancelled = false;
    let cleanupGesture = () => {};
    (async () => {
      const url = await resolve();
      if (cancelled || !url) return;
      audio.src = url;
      audio.loop = true;
      audio.volume = 0.3;
      setReady(true);
      if (wantsMute) return; // resolved and toggleable, just not playing
      try {
        await audio.play();
        setMuted(false);
      } catch {
        // Autoplay blocked — start on the first interaction anywhere.
        const start = () => {
          startPlayback();
          cleanupGesture();
        };
        window.addEventListener("pointerdown", start, { once: true });
        window.addEventListener("keydown", start, { once: true });
        cleanupGesture = () => {
          window.removeEventListener("pointerdown", start);
          window.removeEventListener("keydown", start);
        };
      }
    })();
    return () => {
      cancelled = true;
      cleanupGesture();
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      localStorage.removeItem(MUTE_KEY);
      startPlayback();
    } else {
      localStorage.setItem(MUTE_KEY, "1");
      setMuted(true);
      audio.pause();
    }
  };

  return (
    <>
      <audio ref={audioRef} data-vibe />
      {ready && (
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
      )}
    </>
  );
}
