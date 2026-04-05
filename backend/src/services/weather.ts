/**
 * Weather service — Open-Meteo integration.
 *
 * Open-Meteo (https://open-meteo.com) is free, open-source, and requires no
 * API key. For the UK it selects the ECMWF IFS model automatically, giving
 * ~9 km horizontal resolution and 16-day forecast range.
 *
 * Caching strategy
 * ────────────────
 * Weather data is cached in-memory per (lat, lng) pair, keyed to a 2-decimal-
 * place grid (≈1.1 km precision — more than enough for weather resolution).
 *
 * TTL = 30 minutes. Rationale:
 *   - Open-Meteo updates model runs every 1–6 hours depending on the source
 *     model; there is no value in fetching more often than 30 min.
 *   - A stable with 50 simultaneous users refreshing the dashboard would
 *     collapse to 1 upstream API call per 30 min rather than 50 req/min.
 *   - 30 min keeps the displayed forecast acceptably fresh for operational
 *     decisions (turnout, rug weights) while respecting Open-Meteo's courtesy
 *     rate of <10,000 req/day.
 *
 * No external caching dependency (Redis etc.) is needed for this volume.
 * The cache is process-scoped, so it clears on restart — acceptable because
 * a cold restart is infrequent and the first post-restart fetch is instant.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single day's forecast as returned to API consumers */
export interface DailyForecast {
  date: string;               // ISO 8601 date, e.g. "2026-04-05"
  weatherCode: number;        // WMO weather interpretation code
  description: string;        // Human-readable condition, derived from WMO code
  tempMax: number;            // °C
  tempMin: number;            // °C
  precipitationSum: number;   // mm — total rainfall for the day
  precipitationProbability: number; // 0–100 %
  windSpeedMax: number;       // km/h
  windGustsMax: number;       // km/h
  windDirection: number;      // degrees (0–360)
  uvIndexMax: number;         // UV index
  sunrise: string;            // ISO 8601 datetime
  sunset: string;             // ISO 8601 datetime
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;          // ISO 8601 — when this forecast was fetched
  days: DailyForecast[];
}

// ─── WMO weather code → human-readable description ───────────────────────────
// Reference: https://open-meteo.com/en/docs#weathervariables

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

function wmoDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? 'Unknown';
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  forecast: WeatherForecast;
  expiresAt: number; // Date.now() + TTL
}

const cache = new Map<string, CacheEntry>();

/** Round to 2 d.p. to create a coarse grid key (≈1.1 km precision) */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// ─── Open-Meteo API ───────────────────────────────────────────────────────────

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

// Daily variables to request — each maps to an equestrian decision context:
//   weathercode              → icon / condition classification
//   temperature_2m_max/min   → rug weight selection
//   precipitation_sum        → turnout / arena footing
//   precipitation_probability_max → turnout confidence
//   wind_speed_10m_max       → outdoor arena safety, jumping/lungeing outside
//   wind_gusts_10m_max       → safety threshold for riding out
//   wind_direction_10m_dominant → relevance for exposed fields
//   uv_index_max             → summer management, fly masks
//   sunrise / sunset         → early morning / evening yard schedules
const DAILY_VARIABLES = [
  'weathercode',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
  'uv_index_max',
  'sunrise',
  'sunset',
].join(',');

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    uv_index_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

async function fetchFromOpenMeteo(lat: number, lng: number): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    daily: DAILY_VARIABLES,
    timezone: 'Europe/London',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  });

  const url = `${OPEN_METEO_BASE}?${params}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Horse-Manager/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo responded ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as OpenMeteoResponse;
  const d = data.daily;

  const days: DailyForecast[] = d.time.map((date, i) => ({
    date,
    weatherCode: d.weathercode[i] ?? 0,
    description: wmoDescription(d.weathercode[i] ?? 0),
    tempMax: Math.round(d.temperature_2m_max[i] ?? 0),
    tempMin: Math.round(d.temperature_2m_min[i] ?? 0),
    precipitationSum: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    precipitationProbability: d.precipitation_probability_max[i] ?? 0,
    windSpeedMax: Math.round(d.wind_speed_10m_max[i] ?? 0),
    windGustsMax: Math.round(d.wind_gusts_10m_max[i] ?? 0),
    windDirection: d.wind_direction_10m_dominant[i] ?? 0,
    uvIndexMax: Math.round((d.uv_index_max[i] ?? 0) * 10) / 10,
    sunrise: d.sunrise[i] ?? '',
    sunset: d.sunset[i] ?? '',
  }));

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    fetchedAt: new Date().toISOString(),
    days,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a 7-day weather forecast for the given coordinates.
 *
 * Results are cached for 30 minutes keyed to a ~1 km grid square.
 * Returns null if the upstream API is unreachable — callers should surface a
 * graceful "weather unavailable" state rather than throwing.
 */
export async function getWeatherForecast(lat: number, lng: number): Promise<WeatherForecast | null> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.forecast;
  }

  try {
    const forecast = await fetchFromOpenMeteo(lat, lng);
    cache.set(key, { forecast, expiresAt: Date.now() + CACHE_TTL_MS });
    return forecast;
  } catch (err) {
    console.error('[weather] Open-Meteo fetch failed:', (err as Error).message);
    // Return stale cache if available rather than a total failure
    if (cached) {
      console.warn('[weather] Returning stale cache entry after fetch failure');
      return cached.forecast;
    }
    return null;
  }
}

/** Exposed for admin/debug — returns cache entry count */
export function getWeatherCacheSize(): number {
  return cache.size;
}

/** Purge expired entries — called occasionally to prevent unbounded growth */
export function pruneWeatherCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}
