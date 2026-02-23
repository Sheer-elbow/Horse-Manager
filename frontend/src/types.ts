export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'TRAINER' | 'RIDER' | 'OWNER';
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
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | null;
  latestVersionId?: string | null;
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
  workoutId?: string | null;
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

export interface ScheduleBlock {
  name: string;
  text: string;
}

export interface ScheduleDayEntry {
  week: number;
  day: number;
  title: string;
  category: string;
  durationMin: number | null;
  durationMax: number | null;
  intensityLabel: string | null;
  intensityRpeMin: number | null;
  intensityRpeMax: number | null;
  blocks: ScheduleBlock[];
  substitution: string | null;
  manualRef: string | null;
}

export interface Workout {
  id: string;
  horseId: string;
  appliedPlanId: string;
  originWeek: number;
  originDay: number;
  scheduledDate: string | null;
  slot: 'AM' | 'PM';
  baselineData: ScheduleDayEntry;
  currentData: ScheduleDayEntry;
  isRest: boolean;
  appliedPlan?: {
    id: string;
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    assignedById: string;
    programmeVersion?: {
      id: string;
      version: number;
      manualFileName: string | null;
      programme: { id: string; name: string };
    };
  };
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
  role: 'TRAINER' | 'RIDER' | 'OWNER';
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface ProgrammeVersion {
  id: string;
  programmeId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  numWeeks: number;
  manualFileName: string | null;
  publishedAt: string | null;
  createdAt: string;
  programme?: { id: string; name: string };
}

export interface AppliedPlan {
  id: string;
  horseId: string;
  programmeVersionId: string;
  assignedById: string;
  startDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  programmeVersion?: {
    id: string;
    version: number;
    numWeeks: number;
    programme: { id: string; name: string };
  };
  assignedBy?: { id: string; name: string | null; email: string };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}
