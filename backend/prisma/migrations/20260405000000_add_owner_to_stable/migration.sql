-- AlterTable
ALTER TABLE "stables" ADD COLUMN "owner_id" UUID;

-- AddForeignKey
ALTER TABLE "stables" ADD CONSTRAINT "stables_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
