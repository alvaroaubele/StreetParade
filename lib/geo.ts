// Approximate stage coordinates around the Zürich lake basin.
// The official site publishes no geo data (it lives only in their mobile
// app), so these are curated from the stages page's location descriptions
// and the well-established parade-route landmarks. Good to ~100 m — enough
// to navigate the basin. Correct freely if the official map says otherwise.
const STAGE_GEO: Record<string, [number, number]> = {
  "Opéra Stage": [47.36585, 8.54644], // Sechseläutenplatz, by the opera house
  "Center Stage": [47.36686, 8.5418], // Stadthausquai, between lake and downtown
  "Clubbing Stage": [47.3662, 8.54066], // park at Bürkliplatz
  "Zürich Sound Stage": [47.36566, 8.5398], // flea-market park by Bürkliplatz
  "Innovation Stage": [47.3623, 8.5489], // Utoquai stretch of the route
  "Generations Stage": [47.367, 8.5456], // Bellevue side
  "Young Talent Stage": [47.3656, 8.5385], // General-Guisan-Quai
  "Electric Circus Stage": [47.3674, 8.534], // stops near Stockerstrasse
  "Opening Truck": [47.3596, 8.5501], // parade start, Utoquai
};

/**
 * Walking route through the given stages, each stage once, in first-visit
 * order — a literal repeat-every-block route reads as an 11-leg pinball in
 * Google Maps. Returns null when no stage has coordinates.
 */
export function mapsRouteUrl(stagesInOrder: string[]): string | null {
  const seen = new Set<string>();
  const stops: [number, number][] = [];
  for (const name of stagesInOrder) {
    const geo = STAGE_GEO[name];
    if (!geo || seen.has(name)) continue;
    seen.add(name);
    stops.push(geo);
  }
  if (!stops.length) return null;
  const fmt = ([lat, lng]: [number, number]) => `${lat},${lng}`;
  if (stops.length === 1)
    return `https://www.google.com/maps/search/?api=1&query=${fmt(stops[0])}`;
  const origin = fmt(stops[0]);
  const destination = fmt(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).slice(0, 9).map(fmt).join("|");
  return (
    `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${origin}` +
    `&destination=${destination}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`
  );
}
