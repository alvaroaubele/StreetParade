"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TIME_BLOCKS,
  allGenres,
  allMobiles,
  allStages,
  artistIndex,
  buildDeck,
  defaultFilters,
  playableCount,
  venueLabel,
} from "@/lib/data";
import { clearState, countVotes, loadState, saveState } from "@/lib/store";
import { WelcomeVibe } from "@/components/WelcomeVibe";
import type { Filters } from "@/lib/types";

function Chip({ on, label, onClick, dim }: { on: boolean; label: string; onClick: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
        on
          ? "border-fuchsia-500 bg-fuchsia-600/20 text-fuchsia-200"
          : `border-neutral-700 bg-neutral-900 ${dim ? "text-neutral-500" : "text-neutral-400"}`
      }`}
    >
      {label}
    </button>
  );
}

function SectionHeader({ title, onAll, allOn }: { title: string; onAll: () => void; allOn: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="font-bold">{title}</h3>
      <button onClick={onAll} className="-m-2 p-2 text-sm text-fuchsia-400">
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

export default function FilterPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  // Open for first-timers so the options are discoverable; returning
  // visitors (who already shaped their filters) get the compact view.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [artistQuery, setArtistQuery] = useState("");
  const [existing, setExisting] = useState<{ votes: number } | null>(null);

  useEffect(() => {
    const s = loadState();
    if (s && Object.keys(s.votes).length > 0) {
      setExisting({ votes: countVotes(s.votes) });
      setFilters(s.filters);
      setFiltersOpen(false);
    }
  }, []);

  const { snippets, artists } = useMemo(() => playableCount(filters), [filters]);

  const allArtists = useMemo(
    () => [...artistIndex.values()].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const artistList = filters.artists; // null = all
  const artistOn = (key: string) => artistList === null || artistList.includes(key);
  const visibleArtists = artistQuery
    ? allArtists.filter((a) => a.name.toLowerCase().includes(artistQuery.toLowerCase()))
    : allArtists;

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const start = () => {
    clearState();
    saveState({ filters, deck: buildDeck(filters), position: 0, votes: {} });
    router.push("/swipe");
  };

  const stageNames = allStages.map((v) => v.name);
  const mobileNames = allMobiles.map((v) => v.name);
  const stagesOn = stageNames.filter((n) => filters.venues.includes(n));
  const mobilesOn = mobileNames.filter((n) => filters.venues.includes(n));

  return (
    <main className="flex min-h-dvh flex-col gap-6 pt-10 pb-28">
      <WelcomeVibe />
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-400">
          Street Parade Zürich · 8 Aug 2026
        </p>
        <h1 className="mt-1 text-4xl font-black">ParadeMatch</h1>
        <p className="mt-3 text-neutral-400">
          {snippets} snippets from {artists} artists of the actual line-up — no names shown.
          Swipe what you like. Get your personal route through the parade.
        </p>
      </header>

      {existing ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-300">
            You have a session with {existing.votes} vote{existing.votes === 1 ? "" : "s"}.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push("/swipe")} className="flex-1 rounded-xl bg-fuchsia-600 py-2.5 font-semibold">
              Continue
            </button>
            {existing.votes >= 1 && (
              <button onClick={() => router.push("/results")} className="flex-1 rounded-xl bg-neutral-800 py-2.5 font-semibold">
                See results
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={start}
          disabled={snippets === 0}
          className="rounded-2xl bg-fuchsia-600 py-3.5 text-lg font-bold transition active:scale-[0.98] disabled:opacity-40"
        >
          Start blind test
        </button>
      )}

      <section className="rounded-2xl border border-neutral-800">
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4"
          aria-expanded={filtersOpen}
        >
          <span className="font-bold">Filters</span>
          <span className="text-sm text-neutral-500">
            {filtersOpen ? "hide" : "styles · time of day · more"} {filtersOpen ? "▴" : "▾"}
          </span>
        </button>

        {filtersOpen && (
          <div className="space-y-6 border-t border-neutral-800 p-4">
            <div className="space-y-3">
              <SectionHeader
                title="Styles"
                allOn={filters.genres.length === allGenres.length}
                onAll={() => set({ genres: filters.genres.length === allGenres.length ? [] : [...allGenres] })}
              />
              <div className="flex flex-wrap gap-2">
                {allGenres.map((g) => (
                  <Chip key={g} on={filters.genres.includes(g)} label={g} onClick={() => set({ genres: toggle(filters.genres, g) })} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader
                title="Time of day"
                allOn={filters.blocks.length === TIME_BLOCKS.length}
                onAll={() => set({ blocks: filters.blocks.length === TIME_BLOCKS.length ? [] : TIME_BLOCKS.map((b) => b.id) })}
              />
              <div className="flex flex-wrap gap-2">
                {TIME_BLOCKS.map((b) => (
                  <Chip key={b.id} on={filters.blocks.includes(b.id)} label={b.label} onClick={() => set({ blocks: toggle(filters.blocks, b.id) })} />
                ))}
              </div>
            </div>

      <section className="rounded-2xl border border-neutral-800">
        <button
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4"
          aria-expanded={advancedOpen}
        >
          <span className="font-bold">Advanced Filters</span>
          <span className="text-sm text-neutral-500">
            {advancedOpen ? "hide" : "stages · love mobiles · artists"} {advancedOpen ? "▴" : "▾"}
          </span>
        </button>

        {advancedOpen && (
          <div className="space-y-6 border-t border-neutral-800 p-4">
            <div className="space-y-3">
              <SectionHeader
                title={`Stages (${stagesOn.length}/${stageNames.length})`}
                allOn={stagesOn.length === stageNames.length}
                onAll={() =>
                  set({
                    venues:
                      stagesOn.length === stageNames.length
                        ? filters.venues.filter((n) => !stageNames.includes(n))
                        : [...new Set([...filters.venues, ...stageNames])],
                  })
                }
              />
              <div className="flex flex-wrap gap-2">
                {allStages.map((v) => (
                  <Chip key={v.name} on={filters.venues.includes(v.name)} label={v.name} onClick={() => set({ venues: toggle(filters.venues, v.name) })} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader
                title={`Love Mobiles (${mobilesOn.length}/${mobileNames.length})`}
                allOn={mobilesOn.length === mobileNames.length}
                onAll={() =>
                  set({
                    venues:
                      mobilesOn.length === mobileNames.length
                        ? filters.venues.filter((n) => !mobileNames.includes(n))
                        : [...new Set([...filters.venues, ...mobileNames])],
                  })
                }
              />
              <div className="flex flex-wrap gap-2">
                {allMobiles.map((v) => (
                  <Chip
                    key={v.name}
                    on={filters.venues.includes(v.name)}
                    label={venueLabel(v).replace("Love Mobile ", "")}
                    onClick={() => set({ venues: toggle(filters.venues, v.name) })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader
                title={`Artists (${artistList === null ? allArtists.length : artistList.length}/${allArtists.length})`}
                allOn={artistList === null || artistList.length === allArtists.length}
                onAll={() => set({ artists: artistList === null || artistList.length === allArtists.length ? [] : null })}
              />
              <input
                value={artistQuery}
                onChange={(e) => setArtistQuery(e.target.value)}
                placeholder="Search artists…"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-fuchsia-500"
              />
              <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
                {visibleArtists.map((a) => (
                  <Chip
                    key={a.key}
                    on={artistOn(a.key)}
                    label={a.name}
                    onClick={() => {
                      const cur = artistList === null ? allArtists.map((x) => x.key) : artistList;
                      const next = toggle(cur, a.key);
                      set({ artists: next.length === allArtists.length ? null : next });
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-neutral-800 bg-[#0a0a0f]/95 px-4 py-3 backdrop-blur">
        <button
          onClick={start}
          disabled={snippets === 0}
          className="w-full rounded-2xl bg-fuchsia-600 py-4 text-lg font-bold transition active:scale-[0.98] disabled:opacity-40"
        >
          Start blind test
        </button>
        <p className="mt-1.5 text-center text-sm text-neutral-400">
          10 votes unlock your route — around 50 make it really yours. A new test resets the
          old one.
        </p>
      </div>
    </main>
  );
}
