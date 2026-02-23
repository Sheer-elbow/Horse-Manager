-- AlterTable
ALTER TABLE "vet_visits" ADD COLUMN "file_url" TEXT, ADD COLUMN "file_name" TEXT;

-- AlterTable
ALTER TABLE "farrier_visits" ADD COLUMN "file_url" TEXT, ADD COLUMN "file_name" TEXT;

-- AlterTable
ALTER TABLE "vaccination_records" ADD COLUMN "file_url" TEXT, ADD COLUMN "file_name" TEXT;

-- AlterTable
ALTER TABLE "expense_notes" ADD COLUMN "file_url" TEXT, ADD COLUMN "file_name" TEXT;
