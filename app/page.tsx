"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { allGenres, artistIndex, buildDeck, catalog } from "@/lib/data";
import { clearState, loadState, saveState } from "@/lib/store";

export default function FilterPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(allGenres);
  const [existing, setExisting] = useState<{ votes: number; done: boolean } | null>(null);

  useEffect(() => {
    const s = loadState();
    if (s && Object.keys(s.votes).length > 0) {
      setExisting({ votes: Object.keys(s.votes).length, done: s.position >= s.deck.length });
      setSelected(s.selectedGenres);
    }
  }, []);

  const deckSize = useMemo(() => {
    const chosen = new Set(selected);
    let n = 0;
    for (const [key, info] of artistIndex) {
      const cat = catalog.artists[key];
      if (cat?.trusted && cat.tracks.length && info.genres.some((g) => chosen.has(g))) n++;
    }
    return Math.min(n, 40);
  }, [selected]);

  const toggle = (g: string) =>
    setSelected((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const start = () => {
    clearState();
    saveState({ selectedGenres: selected, deck: buildDeck(selected), position: 0, votes: {} });
    router.push("/swipe");
  };

  return (
    <main className="flex min-h-dvh flex-col gap-6 pt-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-400">
          Street Parade Zürich · 8 Aug 2026
        </p>
        <h1 className="mt-1 text-4xl font-black">ParadeMatch</h1>
        <p className="mt-3 text-neutral-400">
          Hear 30-second snippets from the actual line-up — no names shown. Swipe what you
          like. Get your personal route through the parade.
        </p>
      </header>

      {existing && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-300">
            You have a session with {existing.votes} votes.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => router.push(existing.done ? "/results" : "/swipe")}
              className="flex-1 rounded-xl bg-fuchsia-600 py-2.5 font-semibold"
            >
              Continue
            </button>
            <button
              onClick={() => router.push("/results")}
              className="flex-1 rounded-xl bg-neutral-800 py-2.5 font-semibold"
            >
              See results
            </button>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Styles you care about</h2>
          <button
            onClick={() =>
              setSelected(selected.length === allGenres.length ? [] : allGenres)
            }
            className="text-sm text-fuchsia-400"
          >
            {selected.length === allGenres.length ? "none" : "all"}
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Default is everything — narrow it down to keep the blind test short.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {allGenres.map((g) => {
            const on = selected.includes(g);
            return (
              <button
                key={g}
                onClick={() => toggle(g)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  on
                    ? "border-fuchsia-500 bg-fuchsia-600/20 text-fuchsia-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-400"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-auto">
        <button
          onClick={start}
          disabled={selected.length === 0 || deckSize === 0}
          className="w-full rounded-2xl bg-fuchsia-600 py-4 text-lg font-bold disabled:opacity-40"
        >
          Start blind test · {deckSize} snippets
        </button>
        <p className="mt-2 text-center text-xs text-neutral-600">
          Vote on at least 10 to unlock your route. New test resets the old one.
        </p>
      </div>
    </main>
  );
}
