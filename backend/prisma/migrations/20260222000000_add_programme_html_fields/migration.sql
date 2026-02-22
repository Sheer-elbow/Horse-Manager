-- AlterTable
ALTER TABLE "programmes" ADD COLUMN "html_content" TEXT;
ALTER TABLE "programmes" ADD COLUMN "original_file_name" TEXT;
ALTER TABLE "programmes" ADD COLUMN "horse_names" TEXT[] DEFAULT ARRAY[]::TEXT[];
