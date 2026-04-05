-- AlterTable
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "accepted_terms_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "accepted_privacy_at" TIMESTAMP(3);
