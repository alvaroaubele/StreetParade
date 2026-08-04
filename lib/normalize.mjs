// Single source of truth for artist-name → catalog-key normalization.
// Used by scripts/build-catalog.mjs (Node) and lib/data.ts (app bundle):
// both sides must derive identical keys or catalog lookups silently miss.

/** "Artist • Club", "A b2b B", "X LIVE", "A / B" → primary artist name. */
export function primaryName(name) {
  return name
    .replace(/\s*[•·].*$/, "")
    .replace(/\s+(b2b|vs\.?|x)\s+.*$/i, "")
    .replace(/\s+LIVE$/i, "")
    .replace(/\s*\/.*$/, "")
    .trim();
}

/** Lowercased, diacritic- and punctuation-free key for catalog lookups. */
export function normKey(name) {
  return primaryName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
