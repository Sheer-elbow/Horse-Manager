-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "Slot" AS ENUM ('AM', 'PM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "breed" TEXT,
    "owner_notes" TEXT,
    "stable_location" TEXT,
    "identifying_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horse_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "permission" "Permission" NOT NULL DEFAULT 'VIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horse_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_blocks" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "programme_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "num_weeks" INTEGER NOT NULL DEFAULT 6,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_sessions" (
    "id" TEXT NOT NULL,
    "plan_block_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "Slot" NOT NULL,
    "session_type" TEXT,
    "description" TEXT,
    "duration_minutes" INTEGER,
    "intensity_rpe" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_session_logs" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "Slot" NOT NULL,
    "planned_session_id" TEXT,
    "session_type" TEXT,
    "duration_minutes" INTEGER,
    "intensity_rpe" INTEGER,
    "notes" TEXT,
    "rider" TEXT,
    "deviation_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actual_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_audit_logs" (
    "id" TEXT NOT NULL,
    "actual_session_log_id" TEXT NOT NULL,
    "edited_by_id" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_data" JSONB NOT NULL,
    "new_data" JSONB NOT NULL,

    CONSTRAINT "session_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_visits" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vet_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farrier_visits" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farrier_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "name" TEXT,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_notes" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invite_tokens_token_key" ON "invite_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "horse_assignments_user_id_horse_id_key" ON "horse_assignments"("user_id", "horse_id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_sessions_horse_id_date_slot_key" ON "planned_sessions"("horse_id", "date", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "actual_session_logs_planned_session_id_key" ON "actual_session_logs"("planned_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "actual_session_logs_horse_id_date_slot_key" ON "actual_session_logs"("horse_id", "date", "slot");

-- AddForeignKey
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_assignments" ADD CONSTRAINT "horse_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_assignments" ADD CONSTRAINT "horse_assignments_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_plan_block_id_fkey" FOREIGN KEY ("plan_block_id") REFERENCES "plan_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_session_logs" ADD CONSTRAINT "actual_session_logs_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_session_logs" ADD CONSTRAINT "actual_session_logs_planned_session_id_fkey" FOREIGN KEY ("planned_session_id") REFERENCES "planned_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_session_logs" ADD CONSTRAINT "actual_session_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_audit_logs" ADD CONSTRAINT "session_audit_logs_actual_session_log_id_fkey" FOREIGN KEY ("actual_session_log_id") REFERENCES "actual_session_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_audit_logs" ADD CONSTRAINT "session_audit_logs_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farrier_visits" ADD CONSTRAINT "farrier_visits_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_notes" ADD CONSTRAINT "expense_notes_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
