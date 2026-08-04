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

export interface EventData {
  scrapedAt: string;
  event: { name: string; date: string };
  venues: Venue[];
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

/** One swipeable card: an artist with a playable track. */
export interface DeckCard {
  artistKey: string;
  artistName: string;
  track: CatalogTrack;
  genres: string[];
  appearances: { venue: string; venueType: VenueType; time: string | null; timeWindow?: string | null }[];
}

export type Vote = 1 | -1 | 0; // like | nope | skip

export interface SwipeState {
  selectedGenres: string[];
  deck: DeckCard[];
  position: number;
  votes: Record<string, Vote>;
}
