import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimiter';
import { sendInviteEmail } from '../services/email';
import { AuthRequest, JwtPayload } from '../types';

const router = Router();

function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign({ ...payload }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry,
  } as jwt.SignOptions);
  const refreshToken = jwt.sign({ ...payload }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  } as jwt.SignOptions);
  return { accessToken, refreshToken };
}

// POST /api/auth/login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(payload);

    res.json({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const newPayload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(newPayload);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// POST /api/auth/change-password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/invite (admin only, handled at router level in index.ts)
const inviteSchema = z.object({
  email: z.string().email(),
});

router.post('/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const body = inviteSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    const token = uuid();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    await prisma.inviteToken.create({
      data: {
        email: body.email,
        token,
        createdBy: req.user!.userId,
        expiresAt,
      },
    });

    await sendInviteEmail(body.email, token);
    res.json({ message: `Invite sent to ${body.email}` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/accept-invite
const acceptInviteSchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().min(8),
});

router.post('/accept-invite', async (req, res: Response) => {
  try {
    const body = acceptInviteSchema.parse(req.body);

    const invite = await prisma.inviteToken.findUnique({ where: { token: body.token } });
    if (!invite) {
      res.status(400).json({ error: 'Invalid invite token' });
      return;
    }
    if (invite.usedAt) {
      res.status(400).json({ error: 'Invite already used' });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invite has expired' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: body.name,
        role: 'USER',
        mustChangePassword: false,
      },
    });

    await prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(payload);

    res.json({
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/invites (admin: list pending invites)
router.get('/invites', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const invites = await prisma.inviteToken.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, createdAt: true, expiresAt: true, usedAt: true },
  });
  res.json(invites);
});

export default router;
