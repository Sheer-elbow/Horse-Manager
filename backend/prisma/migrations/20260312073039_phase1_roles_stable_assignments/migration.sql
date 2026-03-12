-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('AUTO', 'REQUESTED', 'APPROVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'STABLE_LEAD';
ALTER TYPE "Role" ADD VALUE 'GROOM';

-- AlterTable
ALTER TABLE "programmes" ALTER COLUMN "horse_names" DROP DEFAULT;

-- CreateTable
CREATE TABLE "stable_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stable_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stable_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horse_priorities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horse_priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stable_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stable_id" TEXT NOT NULL,
    "type" "MembershipType" NOT NULL DEFAULT 'AUTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stable_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stable_assignments_user_id_stable_id_key" ON "stable_assignments"("user_id", "stable_id");

-- CreateIndex
CREATE UNIQUE INDEX "horse_priorities_user_id_horse_id_key" ON "horse_priorities"("user_id", "horse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stable_memberships_user_id_stable_id_key" ON "stable_memberships"("user_id", "stable_id");

-- AddForeignKey
ALTER TABLE "stable_assignments" ADD CONSTRAINT "stable_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stable_assignments" ADD CONSTRAINT "stable_assignments_stable_id_fkey" FOREIGN KEY ("stable_id") REFERENCES "stables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_priorities" ADD CONSTRAINT "horse_priorities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_priorities" ADD CONSTRAINT "horse_priorities_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stable_memberships" ADD CONSTRAINT "stable_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stable_memberships" ADD CONSTRAINT "stable_memberships_stable_id_fkey" FOREIGN KEY ("stable_id") REFERENCES "stables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
