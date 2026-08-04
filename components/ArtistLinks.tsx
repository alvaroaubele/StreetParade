"use client";

import { artistSocials } from "@/lib/data";

const SOCIAL_LABEL: Record<string, string> = {
  soundcloud: "SoundCloud",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  spotify: "Spotify",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/** Official links scraped from streetparade.com, plus a Spotify search fallback. */
export function ArtistLinks({ artistKey, artistName }: { artistKey: string; artistName: string }) {
  const socials = artistSocials(artistKey);
  const links = [
    ...socials.map((s) => ({ label: SOCIAL_LABEL[s.kind] ?? s.kind, url: s.url })),
    ...(socials.some((s) => s.kind === "spotify")
      ? []
      : [{ label: "Spotify ⌕", url: `https://open.spotify.com/search/${encodeURIComponent(artistName)}` }]),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener"
          className="rounded-full border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 transition active:scale-95"
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}
