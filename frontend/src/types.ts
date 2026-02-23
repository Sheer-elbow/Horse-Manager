export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  mustChangePassword: boolean;
  createdAt?: string;
  assignments?: HorseAssignment[];
}

export interface HorseAssignment {
  id: string;
  horseId: string;
  userId?: string;
  permission: 'VIEW' | 'EDIT';
  horse?: Horse;
  user?: { id: string; email: string; name: string | null };
}

export interface Horse {
  id: string;
  name: string;
  age: number | null;
  breed: string | null;
  ownerNotes: string | null;
  stableLocation: string | null;
  identifyingInfo: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _permission?: 'VIEW' | 'EDIT';
  assignments?: HorseAssignment[];
}

export interface Programme {
  id: string;
  name: string;
  description: string | null;
  htmlContent: string | null;
  originalFileName: string | null;
  horseNames: string[];
  createdAt: string;
  _count?: { planBlocks: number };
}

export interface PlanBlock {
  id: string;
  horseId: string;
  programmeId: string | null;
  name: string;
  startDate: string;
  numWeeks: number;
  horse?: { id: string; name: string };
  programme?: { id: string; name: string } | null;
}

export interface PlannedSession {
  id: string;
  planBlockId: string;
  horseId: string;
  date: string;
  slot: 'AM' | 'PM';
  sessionType: string | null;
  description: string | null;
  durationMinutes: number | null;
  intensityRpe: number | null;
  notes: string | null;
  _locked?: boolean;
  actualSession?: ActualSessionLog | null;
}

export interface ActualSessionLog {
  id: string;
  horseId: string;
  date: string;
  slot: 'AM' | 'PM';
  plannedSessionId: string | null;
  sessionType: string | null;
  durationMinutes: number | null;
  intensityRpe: number | null;
  notes: string | null;
  rider: string | null;
  deviationReason: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _edited?: boolean;
  plannedSession?: PlannedSession | null;
  createdBy?: { id: string; name: string | null; email: string };
}

export interface AuditEntry {
  id: string;
  editedAt: string;
  previousData: Record<string, unknown>;
  newData: Record<string, unknown>;
  editedBy: { id: string; name: string | null; email: string };
}

export interface InviteToken {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}
