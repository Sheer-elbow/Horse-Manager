import { Request } from 'express';
import { Role, Permission } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface HorsePermissionRequest extends AuthRequest {
  horsePermission?: Permission;
}
