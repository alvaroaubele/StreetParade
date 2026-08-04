export type VenueType = "stage" | "mobile";

export interface VenueArtist {
  name: string;
  time: string | null;
}

export interface Venue {
  type: VenueType;
  name: string;
  num?: number | null;
  styles: string;
  theme?: string;
  timeWindow?: string | null;
  desc?: string;
  artists: VenueArtist[];
}

export interface SocialLink {
  kind: "soundcloud" | "instagram" | "facebook" | "website" | "spotify" | "youtube" | "tiktok";
  url: string;
}

export interface EventData {
  scrapedAt: string;
  event: { name: string; date: string };
  headliners?: string[];
  venues: Venue[];
  socials?: Record<string, SocialLink[]>;
}

export interface CatalogTrack {
  provider: "deezer" | "itunes";
  trackId: string;
  title: string;
}

export interface CatalogArtist {
  name: string;
  provider: "deezer" | "itunes" | null;
  providerArtist?: string;
  score?: number;
  fans?: number | null;
  trusted: boolean;
  tracks: CatalogTrack[];
}

export interface Catalog {
  builtAt: string;
  artists: Record<string, CatalogArtist>;
}

/** One swipeable card: an artist + one specific track. */
export interface DeckCard {
  artistKey: string;
  artistName: string;
  track: CatalogTrack;
  genres: string[];
  appearances: { venue: string; venueType: VenueType; time: string | null; timeWindow?: string | null }[];
}

/** Like / nope / skip / superlike tallies per artist (an artist can appear on several cards). */
export interface VoteTally {
  l: number;
  n: number;
  s: number;
  /** Superlikes — artist is guaranteed at least one appearance in the route. */
  sl?: number;
}

export interface TimeBlock {
  id: string;
  label: string;
  fromMin: number;
  toMin: number;
}

export interface Filters {
  genres: string[];
  /** Venue names; missing name = deselected. */
  venues: string[];
  /** TimeBlock ids. */
  blocks: string[];
  /** null = all artists; otherwise whitelist of artist keys. */
  artists: string[] | null;
}

export interface SwipeState {
  filters: Filters;
  deck: DeckCard[];
  position: number;
  votes: Record<string, VoteTally>;
  /** Vote history for undo; survives remounts. Absent in pre-v6 states. */
  history?: { key: string; vote: 1 | -1 | 0 | 2 }[];
}
