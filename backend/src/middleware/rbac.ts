import { Response, NextFunction } from 'express';
import { Permission } from '@prisma/client';
import { prisma } from '../db';
import { HorsePermissionRequest } from '../types';

/**
 * Middleware that checks horse-level permissions.
 * Admins always pass. Non-admin users must have an assignment with the required permission.
 */
export function requireHorseAccess(minimumPermission: Permission = 'VIEW') {
  return async (req: HorsePermissionRequest, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Admins have full access
    if (user.role === 'ADMIN') {
      req.horsePermission = 'EDIT';
      next();
      return;
    }

    const horseId = req.params.horseId || req.params.id;
    if (!horseId) {
      res.status(400).json({ error: 'Horse ID required' });
      return;
    }

    const assignment = await prisma.horseAssignment.findUnique({
      where: { userId_horseId: { userId: user.userId, horseId } },
    });

    if (!assignment) {
      res.status(403).json({ error: 'No access to this horse' });
      return;
    }

    if (minimumPermission === 'EDIT' && assignment.permission === 'VIEW') {
      res.status(403).json({ error: 'Edit permission required for this horse' });
      return;
    }

    req.horsePermission = assignment.permission;
    next();
  };
}
