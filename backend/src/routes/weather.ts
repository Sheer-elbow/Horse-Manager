/**
 * GET /api/weather?stableId=<id>
 *
 * Returns a 7-day weather forecast for the stable's location.
 * Requires authentication — any authenticated user may request weather for
 * any stable they have visibility of (weather data is not sensitive).
 *
 * Query params:
 *   stableId  (required) — UUID of the stable
 *   lat       (optional) — override latitude  (admin/debug use)
 *   lng       (optional) — override longitude (admin/debug use)
 *
 * Response 200:
 *   WeatherForecast — see services/weather.ts for the full shape
 *
 * Response 404:
 *   { error: 'Stable not found' }
 *
 * Response 422:
 *   { error: 'Location not set', hint: '...' }  — address exists but no coords yet
 *
 * Response 503:
 *   { error: 'Weather data temporarily unavailable' }  — upstream API down
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { prisma } from '../db';
import { getWeatherForecast } from '../services/weather';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { stableId, lat, lng } = req.query as Record<string, string | undefined>;

  // --- Coordinate override (admin / debug) ---
  if (lat !== undefined && lng !== undefined) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) {
      res.status(400).json({ error: 'lat and lng must be valid numbers' });
      return;
    }
    const forecast = await getWeatherForecast(latitude, longitude);
    if (!forecast) {
      res.status(503).json({ error: 'Weather data temporarily unavailable' });
      return;
    }
    res.json(forecast);
    return;
  }

  // --- Stable-scoped lookup (normal path) ---
  if (!stableId) {
    res.status(400).json({ error: 'stableId query parameter is required' });
    return;
  }

  const stable = await prisma.stable.findUnique({
    where: { id: stableId },
    select: { id: true, latitude: true, longitude: true, address: true },
  }).catch(() => null);

  if (!stable) {
    res.status(404).json({ error: 'Stable not found' });
    return;
  }

  if (stable.latitude === null || stable.longitude === null) {
    // Geocoding hasn't resolved yet (e.g. new stable, or address too vague)
    res.status(422).json({
      error: 'Location not set',
      hint: stable.address
        ? 'Coordinates are being resolved — check back in a moment, or ensure the address includes a UK postcode.'
        : 'Add a postcode to the stable address to enable weather forecasts.',
    });
    return;
  }

  const forecast = await getWeatherForecast(stable.latitude, stable.longitude);
  if (!forecast) {
    res.status(503).json({ error: 'Weather data temporarily unavailable' });
    return;
  }

  res.json(forecast);
});

export default router;
