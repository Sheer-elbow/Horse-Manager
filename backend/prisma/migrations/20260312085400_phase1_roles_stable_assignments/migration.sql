/*
  Warnings:

  - You are about to drop the `security_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_user_id_fkey";

-- DropTable
DROP TABLE "security_events";

-- DropEnum
DROP TYPE "SecurityEventType";
