CREATE TYPE "AppointmentType" AS ENUM ('VET', 'FARRIER', 'DENTIST', 'VACCINATION', 'OTHER');
CREATE TYPE "AppointmentStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "appointments" (
  "id"                TEXT NOT NULL,
  "horse_id"          TEXT NOT NULL,
  "created_by_id"     TEXT NOT NULL,
  "type"              "AppointmentType" NOT NULL,
  "type_other"        TEXT,
  "scheduled_at"      TIMESTAMP(3) NOT NULL,
  "practitioner_name" TEXT,
  "contact_number"    TEXT,
  "location_at_stable" BOOLEAN NOT NULL DEFAULT true,
  "location_other"    TEXT,
  "notes"             TEXT,
  "status"            "AppointmentStatus" NOT NULL DEFAULT 'UPCOMING',
  "reminder_sent"     BOOLEAN NOT NULL DEFAULT false,
  "completed_at"      TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_horse_id_fkey"
    FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE,
  CONSTRAINT "appointments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE INDEX "appointments_horse_id_scheduled_at_idx" ON "appointments"("horse_id", "scheduled_at");
CREATE INDEX "appointments_status_scheduled_at_idx"   ON "appointments"("status", "scheduled_at");
