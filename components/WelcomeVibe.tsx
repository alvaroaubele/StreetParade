"use client";

import { useEffect, useRef, useState } from "react";
import { welcomeTrack } from "@/lib/data";

const MUTE_KEY = "parademtach-vibe-muted";

/**
 * Chill ambience on the landing page: a warm house snippet from the line-up,
 * looped at low volume. Browsers block un-gestured audio, so if autoplay is
 * refused the first tap anywhere starts it; the speaker toggle always
 * renders once the track is resolved, so muting is reversible.
 *
 * Loudness: element volume (works everywhere except iOS), upgraded to a
 * WebAudio gain node the first time playback starts inside a user gesture —
 * never earlier. An AudioContext created outside a gesture starts suspended,
 * and a media element routed into a suspended context plays in silence,
 * which is exactly the bug this ordering avoids. If the element errors with
 * crossOrigin set (a CDN response without CORS), it retries plain and keeps
 * the volume-property path.
 */
export function WelcomeVibe() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainWired = useRef(false);
  const corsFallback = useRef(false);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  /** Only ever called from inside a user-gesture handler. */
  const wireGainInGesture = () => {
    const audio = audioRef.current;
    if (!audio || corsFallback.current) return;
    try {
      if (!gainWired.current) {
        type AC = typeof AudioContext;
        const Ctx: AC | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const src = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = 0.3;
        src.connect(gain).connect(ctx.destination);
        ctxRef.current = ctx;
        gainWired.current = true;
      }
      ctxRef.current?.resume().catch(() => {});
    } catch {
      // Graph refused — element volume keeps working on non-iOS.
    }
  };

  useEffect(() => {
    const wantsMute = localStorage.getItem(MUTE_KEY) === "1";
    setMuted(wantsMute);
    const vibe = welcomeTrack();
    const audio = audioRef.current;
    if (!vibe || !audio) return;

    let cancelled = false;
    let cleanupGesture = () => {};
    const onError = () => {
      // crossOrigin + a non-CORS CDN response kills the load entirely;
      // retry plain and give up on the WebAudio path.
      if (audio.crossOrigin && !corsFallback.current) {
        corsFallback.current = true;
        const src = audio.src;
        audio.removeAttribute("crossorigin");
        audio.src = src;
        audio.load();
        if (!localStorage.getItem(MUTE_KEY)) audio.play().catch(() => {});
      }
    };
    audio.addEventListener("error", onError);

    (async () => {
      try {
        const res = await fetch(`/api/preview?provider=${vibe.track.provider}&id=${vibe.track.trackId}`);
        if (!res.ok) return;
        const { url } = await res.json();
        if (cancelled) return;
        audio.crossOrigin = "anonymous";
        audio.src = url;
        audio.loop = true;
        audio.volume = 0.3;
        setReady(true);
        if (wantsMute) return; // resolved and toggleable, just not playing
        try {
          await audio.play();
          setMuted(false);
          // Autoplay without a gesture succeeded; upgrade to the gain node
          // at the first interaction so iOS gets real volume control too.
          const upgrade = () => wireGainInGesture();
          window.addEventListener("pointerdown", upgrade, { once: true });
          cleanupGesture = () => window.removeEventListener("pointerdown", upgrade);
        } catch {
          // Autoplay blocked — start (and wire the gain) on the first tap.
          const start = () => {
            wireGainInGesture();
            audio.play().then(() => setMuted(false)).catch(() => {});
            cleanupGesture();
          };
          window.addEventListener("pointerdown", start, { once: true });
          window.addEventListener("keydown", start, { once: true });
          cleanupGesture = () => {
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("keydown", start);
          };
        }
      } catch {
        // No ambience is fine — the page works silent.
      }
    })();
    return () => {
      cancelled = true;
      cleanupGesture();
      audio.removeEventListener("error", onError);
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      localStorage.removeItem(MUTE_KEY);
      setMuted(false);
      if (audio.src) {
        wireGainInGesture(); // toggle click is a gesture
        audio.play().catch(() => {});
      }
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
