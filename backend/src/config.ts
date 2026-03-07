const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

// Refuse to start in production with well-known fallback secrets — a missing
// env var would make every JWT trivially forgeable by anyone who has read
// this source code or a Docker image layer.
if (isProduction) {
  if (JWT_SECRET === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a strong random value in production');
  }
  if (JWT_REFRESH_SECRET === 'dev-refresh-secret-change-me') {
    throw new Error('JWT_REFRESH_SECRET must be set to a strong random value in production');
  }
} else {
  if (JWT_SECRET === 'dev-secret-change-me' || JWT_REFRESH_SECRET === 'dev-refresh-secret-change-me') {
    console.warn('[security] WARNING: Using default JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET before deploying to production.');
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,

  jwt: {
    secret: JWT_SECRET,
    refreshSecret: JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },

  admin: {
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },

  appUrl: process.env.APP_URL || 'http://localhost:5173',
};
