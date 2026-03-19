const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// No fallback defaults — a missing or empty secret would silently allow
// JWTs to be forged with an empty key, which is worse than a startup crash.
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '';

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
