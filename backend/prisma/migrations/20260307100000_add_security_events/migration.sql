-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILURE',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_USED',
    'PASSWORD_CHANGED',
    'INVITE_SENT',
    'INVITE_ACCEPTED',
    'ROLE_CHANGED',
    'USER_DELETED',
    'ACCESS_DENIED'
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "event_type" "SecurityEventType" NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "security_events_event_type_idx" ON "security_events"("event_type");

-- CreateIndex
CREATE INDEX "security_events_ip_address_idx" ON "security_events"("ip_address");

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
