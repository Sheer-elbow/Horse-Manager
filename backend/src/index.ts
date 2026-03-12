import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { prisma } from './db';
import bcrypt from 'bcryptjs';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import horseRoutes from './routes/horses';
import programmeRoutes from './routes/programmes';
import planRoutes from './routes/plans';
import sessionRoutes from './routes/sessions';
import healthRoutes from './routes/health';
import appliedPlanRoutes from './routes/applied-plans';
import workoutRoutes from './routes/workouts';
import securityRoutes from './routes/security';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import searchRoutes from './routes/search';
import stableRoutes from './routes/stables';
import stableAssignmentRoutes from './routes/stableAssignments';
import horsePriorityRoutes from './routes/horsePriority';
import { startNotificationScheduler } from './services/notification-scheduler';

const app = express();

// Remove the X-Powered-By header that fingerprints the server as Express
app.disable('x-powered-by');

// Security headers
app.use((_req, res, next) => {
  // Prevent MIME-type sniffing (defence-in-depth alongside upload validation)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Deny embedding in iframes (clickjacking)
  res.setHeader('X-Frame-Options', 'DENY');
  // Limit referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS — only in production where TLS is guaranteed
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'production' ? config.appUrl : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Static file serving for uploads — authentication required.
// Without this gate the entire uploads/ directory is publicly accessible to
// any anonymous HTTP client that can guess or enumerate a filename.
app.use('/api/uploads', (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}, express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/horses', horseRoutes);
app.use('/api/programmes', programmeRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/applied-plans', appliedPlanRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/stables', stableRoutes);
app.use('/api/stables/:stableId/assignments', stableAssignmentRoutes);
app.use('/api/stables/:stableId/priorities', stableAssignmentRoutes);
app.use('/api/horses/:horseId/priority', horsePriorityRoutes);

// Health check
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler - catches multer, JSON parse, and unhandled route errors
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer file-size limit exceeded
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. Check upload size limits.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  // JSON body parse errors (e.g. payload too large, malformed JSON)
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large. Maximum size is 1 MB.' });
    return;
  }
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON in request body' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Validate required environment variables before startup
function validateEnv() {
  const missing: string[] = [];

  if (!config.admin.email) missing.push('ADMIN_EMAIL');
  if (!config.admin.password) missing.push('ADMIN_PASSWORD');

  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[FATAL] Set these in your .env file before starting the server.');
    process.exit(1);
  }

  if (config.admin.password.length < 16) {
    console.error('[FATAL] ADMIN_PASSWORD must be at least 16 characters long.');
    console.error('[FATAL] Choose a strong, unique password before starting the server.');
    process.exit(1);
  }

  if (
    config.jwt.secret === 'dev-secret-change-me' ||
    config.jwt.refreshSecret === 'dev-refresh-secret-change-me'
  ) {
    console.error('[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must be changed from their default values.');
    process.exit(1);
  }
}

// Seed admin user on startup
async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: config.admin.email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(config.admin.password, 12);
  await prisma.user.create({
    data: {
      email: config.admin.email,
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });
  console.log(`[INFO] Admin user seeded: ${config.admin.email}`);
  console.warn('[SECURITY] REMINDER: Log in as admin and change the password immediately.');
  console.warn('[SECURITY] The admin password from .env should not be used as a permanent password.');
}

// Start server
async function main() {
  validateEnv();
  await seedAdmin();
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port} (${config.nodeEnv})`);
  });
  startNotificationScheduler();
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
