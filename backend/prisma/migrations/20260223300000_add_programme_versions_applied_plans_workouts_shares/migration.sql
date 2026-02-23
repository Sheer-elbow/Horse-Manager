-- Migration: add_programme_versions_applied_plans_workouts_shares
--
-- MIGRATION NOTE:
-- ===============
-- Tables added:
--   - programme_versions: immutable snapshots of programme schedules + manuals
--   - applied_plans: tracks a programme version applied to a specific horse
--   - workouts: individual daily workout cards generated from an applied plan
--   - plan_shares: sharing an applied plan between trainers (VIEW/EDIT)
--
-- Columns added to existing tables:
--   - programmes.status (nullable) — ProgrammeStatus enum, null for legacy rows
--   - programmes.latest_version_id (nullable) — FK to programme_versions, null for legacy rows
--   - plan_blocks.applied_plan_id (nullable) — FK to applied_plans, null for manually-created blocks
--   - planned_sessions.workout_id (nullable) — FK to workouts, null for manually-created sessions
--
-- Safety:
--   - All changes are additive (no drops, no renames, no NOT NULL on existing columns)
--   - All new columns on existing tables are nullable — existing rows unaffected
--   - No backfill required — null means "legacy / manual" and is handled by application code
--   - New tables have no impact on existing queries

-- 1. Create new enums
CREATE TYPE "ProgrammeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AppliedPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- 2. Create programme_versions table
CREATE TABLE "programme_versions" (
    "id" TEXT NOT NULL,
    "programme_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProgrammeStatus" NOT NULL DEFAULT 'DRAFT',
    "num_weeks" INTEGER NOT NULL,
    "manual_html" TEXT,
    "manual_file_name" TEXT,
    "schedule_data" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_versions_pkey" PRIMARY KEY ("id")
);

-- 3. Create applied_plans table
CREATE TABLE "applied_plans" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "programme_version_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "status" "AppliedPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "source_applied_plan_id" TEXT,
    "is_amended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applied_plans_pkey" PRIMARY KEY ("id")
);

-- 4. Create workouts table
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "applied_plan_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "origin_week" INTEGER NOT NULL,
    "origin_day" INTEGER NOT NULL,
    "scheduled_date" DATE,
    "slot" "Slot" NOT NULL DEFAULT 'AM',
    "baseline_data" JSONB NOT NULL,
    "current_data" JSONB NOT NULL,
    "is_rest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- 5. Create plan_shares table
CREATE TABLE "plan_shares" (
    "id" TEXT NOT NULL,
    "applied_plan_id" TEXT NOT NULL,
    "shared_with_id" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_shares_pkey" PRIMARY KEY ("id")
);

-- 6. Add nullable columns to existing tables
ALTER TABLE "programmes" ADD COLUMN "status" "ProgrammeStatus";
ALTER TABLE "programmes" ADD COLUMN "latest_version_id" TEXT;

ALTER TABLE "plan_blocks" ADD COLUMN "applied_plan_id" TEXT;

ALTER TABLE "planned_sessions" ADD COLUMN "workout_id" TEXT;

-- 7. Create unique constraints
CREATE UNIQUE INDEX "programme_versions_programme_id_version_key" ON "programme_versions"("programme_id", "version");
CREATE UNIQUE INDEX "plan_shares_applied_plan_id_shared_with_id_key" ON "plan_shares"("applied_plan_id", "shared_with_id");

-- 8. Add foreign keys for new tables
ALTER TABLE "programme_versions" ADD CONSTRAINT "programme_versions_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applied_plans" ADD CONSTRAINT "applied_plans_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applied_plans" ADD CONSTRAINT "applied_plans_programme_version_id_fkey" FOREIGN KEY ("programme_version_id") REFERENCES "programme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applied_plans" ADD CONSTRAINT "applied_plans_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applied_plans" ADD CONSTRAINT "applied_plans_source_applied_plan_id_fkey" FOREIGN KEY ("source_applied_plan_id") REFERENCES "applied_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workouts" ADD CONSTRAINT "workouts_applied_plan_id_fkey" FOREIGN KEY ("applied_plan_id") REFERENCES "applied_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_applied_plan_id_fkey" FOREIGN KEY ("applied_plan_id") REFERENCES "applied_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Add foreign keys for new nullable columns on existing tables
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_applied_plan_id_fkey" FOREIGN KEY ("applied_plan_id") REFERENCES "applied_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
