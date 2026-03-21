CREATE TYPE "SecurityEventType" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'ROLE_CHANGED',
  'USER_DELETED',
  'INVITE_SENT',
  'INVITE_ACCEPTED',
  'TOKEN_REFRESHED',
  'PASSWORD_RESET_USED',
  'SUSPICIOUS_ACTIVITY'
);

CREATE TABLE "security_events" (
  "id"          TEXT NOT NULL,
  "event_type"  "SecurityEventType" NOT NULL,
  "user_id"     TEXT,
  "email"       TEXT,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "outcome"     TEXT NOT NULL,
  "metadata"    JSONB,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "security_events_event_type_created_at_idx" ON "security_events"("event_type", "created_at");
CREATE INDEX "security_events_ip_address_created_at_idx" ON "security_events"("ip_address", "created_at");
