"use client";

import { useEffect, useRef, useState } from "react";
import { welcomeTrack } from "@/lib/data";

const MUTE_KEY = "parademtach-vibe-muted";

/**
 * Chill ambience on the landing page: a warm house snippet from the line-up,
 * looped at low volume. Browsers block un-gestured audio, so if autoplay is
 * refused the first tap anywhere starts it. A speaker toggle mutes it and the
 * choice is remembered.
 */
export function WelcomeVibe() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wantsMute = localStorage.getItem(MUTE_KEY) === "1";
    setMuted(wantsMute);
    const vibe = welcomeTrack();
    const audio = audioRef.current;
    if (!vibe || !audio || wantsMute) return;

    let cancelled = false;
    let cleanupGesture = () => {};
    (async () => {
      try {
        const res = await fetch(`/api/preview?provider=${vibe.track.provider}&id=${vibe.track.trackId}`);
        if (!res.ok) return;
        const { url } = await res.json();
        if (cancelled) return;
        audio.src = url;
        audio.loop = true;
        audio.volume = 0.3;
        setReady(true);
        try {
          await audio.play();
          setMuted(false);
        } catch {
          // Autoplay blocked — start on the first interaction anywhere.
          const start = () => {
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
      audio.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      localStorage.removeItem(MUTE_KEY);
      setMuted(false);
      if (audio.src) audio.play().catch(() => {});
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
          className="fixed right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-neutral-700 bg-neutral-900/90 text-lg backdrop-blur transition active:scale-95"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}
    </>
  );
}
