-- Rename existing USER role to RIDER (must happen before adding RIDER value)
ALTER TYPE "Role" RENAME VALUE 'USER' TO 'RIDER';

-- Add new role values
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TRAINER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';

-- Update default role on users table
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'RIDER'::"Role";

-- Add role column to invite_tokens
ALTER TABLE "invite_tokens" ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'RIDER'::"Role";
