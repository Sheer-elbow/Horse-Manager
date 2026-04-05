import { Request } from 'express';
import { Role, Permission } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  tokenVersion: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// How the current user is accessing a particular horse
export type HorseAccessType =
  | 'ADMIN'         // global admin
  | 'OWNER_EDIT'    // owner via HorseAssignment EDIT
  | 'TRAINER_VIEW'  // trainer via HorseAssignment VIEW
  | 'LEAD_VIEW'     // stable lead via StableAssignment
  | 'STAFF_VIEW';   // rider/groom via StableAssignment

export interface HorsePermissionRequest extends AuthRequest {
  horsePermission?: Permission;
  horseAccessType?: HorseAccessType;
}
