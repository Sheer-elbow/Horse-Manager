import rateLimit from 'express-rate-limit';

// Strict limiter for credential endpoints (login)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window — prevents online brute-force
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failures
});

// Very strict limiter for invite acceptance — an invite token is a credential
// and must not be brute-forced. 3 attempts per hour regardless of outcome.
export const inviteAcceptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many invite acceptance attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limiter for token refresh (prevents token-hammering)
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many token refresh requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for password reset requests — applies regardless of whether
// the email exists (we always return 200 to prevent user enumeration, so we
// must not rely on skipSuccessfulRequests here).
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General limiter applied to all /api routes — prevents enumeration and
// resource exhaustion from any single IP. Intentionally generous to avoid
// blocking legitimate power users (e.g. rapid UI navigation).
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
