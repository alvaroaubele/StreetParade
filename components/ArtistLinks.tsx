"use client";

import {
  siFacebook,
  siInstagram,
  siSoundcloud,
  siSpotify,
  siTiktok,
  siYoutube,
} from "simple-icons";
import { artistSocials } from "@/lib/data";

const SOCIAL: Record<string, { label: string; path: string }> = {
  soundcloud: { label: "SoundCloud", path: siSoundcloud.path },
  instagram: { label: "Instagram", path: siInstagram.path },
  facebook: { label: "Facebook", path: siFacebook.path },
  spotify: { label: "Spotify", path: siSpotify.path },
  youtube: { label: "YouTube", path: siYoutube.path },
  tiktok: { label: "TikTok", path: siTiktok.path },
  // Hand-drawn globe — simple-icons carries brands only.
  website: {
    label: "Website",
    path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.02a15.7 15.7 0 0 0-1.2-5.24A8.02 8.02 0 0 1 19.93 11zM12 4.07c.9 1.28 1.7 3.42 1.9 6.93h-3.8c.2-3.51 1-5.65 1.9-6.93zM8.29 5.76A15.7 15.7 0 0 0 7.09 11H4.07a8.02 8.02 0 0 1 4.22-5.24zM4.07 13h3.02c.15 1.97.57 3.76 1.2 5.24A8.02 8.02 0 0 1 4.07 13zM12 19.93c-.9-1.28-1.7-3.42-1.9-6.93h3.8c-.2 3.51-1 5.65-1.9 6.93zm3.71-1.69c.63-1.48 1.05-3.27 1.2-5.24h3.02a8.02 8.02 0 0 1-4.22 5.24z",
  },
};

/** Official links scraped from streetparade.com, plus a Spotify search fallback. */
export function ArtistLinks({ artistKey, artistName }: { artistKey: string; artistName: string }) {
  const socials = artistSocials(artistKey);
  const links = [
    ...socials.map((s) => ({ ...(SOCIAL[s.kind] ?? { label: s.kind, path: SOCIAL.website.path }), url: s.url })),
    ...(socials.some((s) => s.kind === "spotify")
      ? []
      : [{ label: "Spotify ⌕", path: siSpotify.path, url: `https://open.spotify.com/search/${encodeURIComponent(artistName)}` }]),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
            <path d={l.path} />
          </svg>
          {l.label}
        </a>
      ))}
    </div>
  );
}
