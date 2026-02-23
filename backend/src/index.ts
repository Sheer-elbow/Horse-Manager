import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
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

const app = express();

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

// Static file serving for uploads
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

// Seed admin user on startup
async function seedAdmin() {
  if (!config.admin.email || !config.admin.password) return;

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
  console.log(`Admin user seeded: ${config.admin.email}`);
}

// Start server
async function main() {
  await seedAdmin();
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
