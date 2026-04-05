/**
 * Geocoding service: converts a UK stable address string into WGS-84
 * latitude/longitude coordinates.
 *
 * Strategy:
 *   1. Extract a UK postcode from the address with a regex.
 *   2. Look up the postcode via Postcodes.io (free, no API key, UK-only).
 *   3. If no postcode is found, fall back to Nominatim (OpenStreetMap)
 *      with the full address text.
 *
 * Both providers are free and require no API keys, which is intentional —
 * geocoding only fires on stable create/update (low volume), so rate limits
 * are not a concern.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Matches standard UK postcode formats:
//   AN NAA, ANN NAA, AAN NAA, AANN NAA, ANA NAA, AANA NAA
// The space between outward and inward parts is made optional so it matches
// whether the user typed "RG14 2AB" or "RG142AB".
const UK_POSTCODE_RE = /\b([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})\b/i;

/**
 * Attempt to geocode via Postcodes.io.
 * Returns null if the postcode is not found or the request fails.
 */
async function geocodeByPostcode(postcode: string): Promise<Coordinates | null> {
  // Normalise: remove embedded spaces, uppercase — Postcodes.io accepts both
  const normalised = postcode.replace(/\s+/g, '').toUpperCase();
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(normalised)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Horse-Manager/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      status: number;
      result?: { latitude: number; longitude: number };
    };

    if (json.status !== 200 || !json.result) return null;

    return { latitude: json.result.latitude, longitude: json.result.longitude };
  } catch (err) {
    console.warn('[geocoding] Postcodes.io request failed:', (err as Error).message);
    return null;
  }
}

/**
 * Fall-back: geocode using Nominatim (OpenStreetMap).
 * Less precise than postcode lookup but handles addresses without postcodes.
 * Nominatim's terms require a descriptive User-Agent and forbid > 1 req/s.
 * Since this only fires on stable save, those constraints are trivially met.
 */
async function geocodeByNominatim(address: string): Promise<Coordinates | null> {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'gb',  // bias results to Great Britain
  });

  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Horse-Manager/1.0 (stable-weather-geocoder)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json.length) return null;

    return {
      latitude: parseFloat(json[0].lat),
      longitude: parseFloat(json[0].lon),
    };
  } catch (err) {
    console.warn('[geocoding] Nominatim request failed:', (err as Error).message);
    return null;
  }
}

/**
 * Main export: geocode an address string.
 *
 * Returns null if both providers fail (e.g. address too vague, network error).
 * The caller should treat null as "coordinates unknown" and surface a soft
 * prompt to the user rather than throwing an error.
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // --- Pass 1: postcode extraction + Postcodes.io ---
  const postcodeMatch = trimmed.match(UK_POSTCODE_RE);
  if (postcodeMatch) {
    const coords = await geocodeByPostcode(postcodeMatch[1]);
    if (coords) {
      console.info(`[geocoding] Resolved "${trimmed}" via postcode → ${coords.latitude}, ${coords.longitude}`);
      return coords;
    }
  }

  // --- Pass 2: Nominatim full-address fallback ---
  const coords = await geocodeByNominatim(trimmed);
  if (coords) {
    console.info(`[geocoding] Resolved "${trimmed}" via Nominatim → ${coords.latitude}, ${coords.longitude}`);
    return coords;
  }

  console.warn(`[geocoding] Could not resolve coordinates for address: "${trimmed}"`);
  return null;
}
