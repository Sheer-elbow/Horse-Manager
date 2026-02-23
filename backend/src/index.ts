import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

const app = express();

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'production' ? config.appUrl : true,
  credentials: true,
}));
app.use(express.json());
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

// Health check
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler - catches unhandled errors from routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
