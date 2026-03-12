import { Response, NextFunction } from 'express';
import { Permission } from '@prisma/client';
import { prisma } from '../db';
import { HorsePermissionRequest } from '../types';

/**
 * Resolves horse access for the current user across all access paths:
 *  - ADMIN: global admin, always EDIT
 *  - OWNER_EDIT: HorseAssignment with EDIT (owner)
 *  - TRAINER_VIEW: HorseAssignment with VIEW (trainer granted by owner)
 *  - LEAD_VIEW: StableAssignment for the horse's stable (role = STABLE_LEAD)
 *  - STAFF_VIEW: StableAssignment for the horse's stable (role = RIDER or GROOM)
 */
export function requireHorseAccess(minimumPermission: Permission = 'VIEW') {
  return async (req: HorsePermissionRequest, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (user.role === 'ADMIN') {
      req.horsePermission = 'EDIT';
      req.horseAccessType = 'ADMIN';
      next();
      return;
    }

    const horseId = req.params.horseId || req.params.id;
    if (!horseId) {
      res.status(400).json({ error: 'Horse ID required' });
      return;
    }

    // Check HorseAssignment first (owner / trainer)
    const assignment = await prisma.horseAssignment.findUnique({
      where: { userId_horseId: { userId: user.userId, horseId } },
    });

    if (assignment) {
      if (minimumPermission === 'EDIT' && assignment.permission === 'VIEW') {
        res.status(403).json({ error: 'Edit permission required for this horse' });
        return;
      }
      req.horsePermission = assignment.permission;
      req.horseAccessType = assignment.permission === 'EDIT' ? 'OWNER_EDIT' : 'TRAINER_VIEW';
      next();
      return;
    }

    // For stable-based access, EDIT operations are not permitted
    if (minimumPermission === 'EDIT') {
      res.status(403).json({ error: 'Edit permission required for this horse' });
      return;
    }

    // Check StableAssignment (stable lead / rider / groom)
    const horse = await prisma.horse.findUnique({
      where: { id: horseId },
      select: { stableId: true },
    });

    if (horse?.stableId) {
      const stableAssignment = await prisma.stableAssignment.findUnique({
        where: { userId_stableId: { userId: user.userId, stableId: horse.stableId } },
      });

      if (stableAssignment) {
        req.horsePermission = 'VIEW';
        req.horseAccessType = user.role === 'STABLE_LEAD' ? 'LEAD_VIEW' : 'STAFF_VIEW';
        next();
        return;
      }
    }

    res.status(403).json({ error: 'No access to this horse' });
  };
}
