import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { loginLimiter, inviteAcceptLimiter, refreshLimiter, forgotPasswordLimiter, apiLimiter } from '../middleware/rateLimiter';
import { sendInviteEmail, sendPasswordResetEmail } from '../services/email';
import { logSecurityEvent } from '../services/securityLog';
import { AuthRequest, JwtPayload } from '../types';
import { passwordSchema } from '../lib/password';

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
      void logSecurityEvent('LOGIN_FAILURE', req, { email: body.email, outcome: 'failure' });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    const tokens = generateTokens(payload);
    void logSecurityEvent('LOGIN_SUCCESS', req, { userId: user.id, email: user.email, outcome: 'success' });

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
router.post('/refresh', refreshLimiter, async (req, res: Response) => {
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

    // Reject refresh tokens issued before the last password change / logout-all
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    const newPayload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    const tokens = generateTokens(newPayload);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
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
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
    void logSecurityEvent('PASSWORD_CHANGED', req, { userId: user.id, email: user.email, outcome: 'success' });

    // Return fresh tokens so the current session stays alive after the version bump
    const newPayload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion + 1 };
    const tokens = generateTokens(newPayload);

    res.json({ message: 'Password changed successfully', ...tokens });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/invite (admin only)
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['STABLE_LEAD', 'RIDER', 'GROOM', 'OWNER', 'TRAINER']).default('RIDER'),
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
        role: body.role,
        createdBy: req.user!.userId,
        expiresAt,
      },
    });

    const inviteUrl = `${config.appUrl}/accept-invite?token=${token}`;

    // Try to send email, but always return the invite link as fallback
    let emailSent = false;
    try {
      await sendInviteEmail(body.email, token);
      emailSent = true;
    } catch (err) {
      // Log the detail server-side only — never expose SMTP internals to the client
      console.error('Failed to send invite email:', err instanceof Error ? err.message : err);
    }

    void logSecurityEvent('INVITE_SENT', req, {
      userId: req.user!.userId,
      email: req.user!.email,
      outcome: 'info',
      metadata: { invitedEmail: body.email, role: body.role },
    });

    if (emailSent) {
      res.json({ message: `Invite sent to ${body.email}`, inviteUrl });
    } else {
      res.json({
        message: `Invite created but email could not be sent. Share the link manually.`,
        inviteUrl,
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register — self-registration (no invite required)
const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }) }),
  // Optional stable to create immediately
  stableName: z.string().min(1).max(100).optional(),
  stableAddress: z.string().nullable().optional(),
});

router.post('/register', apiLimiter, async (req, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const now = new Date();

    // Create user with OWNER role in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: body.email, name: body.name, passwordHash, role: 'OWNER', acceptedTermsAt: now, acceptedPrivacyAt: now },
      });

      let stable = null;
      if (body.stableName) {
        stable = await tx.stable.create({
          data: { name: body.stableName, address: body.stableAddress ?? null, ownerId: user.id },
        });
      }

      return { user, stable };
    });

    const { user } = result;
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    const tokens = generateTokens(payload);

    void logSecurityEvent('USER_REGISTERED', req, {
      userId: user.id,
      email: user.email,
      outcome: 'success',
      metadata: { stableName: body.stableName ?? null },
    });

    res.status(201).json({
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/invite-preview?token=... — unauthenticated, safe to call before account creation
router.get('/invite-preview', async (req, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Token required' });
    return;
  }
  try {
    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: { creator: { select: { name: true, email: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invalid or expired invite' });
      return;
    }
    res.json({
      email: invite.email,
      role: invite.role,
      inviterName: invite.creator.name || invite.creator.email,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load invite details' });
  }
});

// POST /api/auth/accept-invite
const acceptInviteSchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }) }),
});

router.post('/accept-invite', inviteAcceptLimiter, async (req, res: Response) => {
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
    const acceptedAt = new Date();
    const user = await prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: body.name,
        role: invite.role,
        mustChangePassword: false,
        acceptedTermsAt: acceptedAt,
        acceptedPrivacyAt: acceptedAt,
      },
    });

    await prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    void logSecurityEvent('INVITE_ACCEPTED', req, {
      userId: user.id,
      email: user.email,
      outcome: 'success',
      metadata: { name: body.name, role: invite.role },
    });

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
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

// POST /api/auth/forgot-password
// Always responds 200 so attackers cannot enumerate registered emails.
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res: Response) => {
  const GENERIC_OK = { message: 'If that email is registered, a reset link has been sent.' };
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (user) {
      // Invalidate any existing unused tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // 256-bit random token — only the SHA-256 hash is stored
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      void logSecurityEvent('PASSWORD_RESET_REQUESTED', req, {
        userId: user.id,
        email: user.email,
        outcome: 'info',
      });

      try {
        await sendPasswordResetEmail(user.email, rawToken);
      } catch (err) {
        console.error('Failed to send password reset email:', err instanceof Error ? err.message : err);
      }
    }

    res.json(GENERIC_OK);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Forgot password error:', err);
    // Still return the generic message to avoid leaking server errors
    res.json(GENERIC_OK);
  }
});

// POST /api/auth/reset-password
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

router.post('/reset-password', loginLimiter, async (req, res: Response) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }
    if (record.usedAt) {
      res.status(400).json({ error: 'Reset token has already been used' });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    void logSecurityEvent('PASSWORD_RESET_USED', req, { userId: record.userId, outcome: 'success' });
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/invites (admin: list pending invites)
router.get('/invites', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  try {
    const invites = await prisma.inviteToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, usedAt: true },
    });
    res.json(invites);
  } catch (err) {
    console.error('List invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/auth/invites/:id (admin: cancel a pending invite)
router.delete('/invites/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const invite = await prisma.inviteToken.findUnique({ where: { id: req.params.id } });
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.usedAt) {
      res.status(400).json({ error: 'Cannot cancel an invite that has already been accepted' });
      return;
    }
    await prisma.inviteToken.delete({ where: { id: req.params.id } });
    res.json({ message: 'Invite cancelled' });
  } catch (err) {
    console.error('Cancel invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/invites/:id/resend (admin: issue a fresh token and resend email)
router.post('/invites/:id/resend', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const invite = await prisma.inviteToken.findUnique({ where: { id: req.params.id } });
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.usedAt) {
      res.status(400).json({ error: 'Cannot resend an invite that has already been accepted' });
      return;
    }
    // Issue a fresh token and reset the expiry window
    const newToken = uuid();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const updated = await prisma.inviteToken.update({
      where: { id: req.params.id },
      data: { token: newToken, expiresAt },
    });
    const inviteUrl = `${config.appUrl}/accept-invite?token=${newToken}`;
    let emailSent = false;
    try {
      await sendInviteEmail(updated.email, newToken);
      emailSent = true;
    } catch (err) {
      console.error('Failed to resend invite email:', err instanceof Error ? err.message : err);
    }
    res.json({
      message: emailSent
        ? `Invite resent to ${updated.email}`
        : `Invite link refreshed but email could not be sent. Share the link manually.`,
      inviteUrl,
    });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
