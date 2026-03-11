-- CreateTable
CREATE TABLE "stables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stables_name_key" ON "stables"("name");

-- AlterTable
ALTER TABLE "horses" ADD COLUMN "stable_id" TEXT;

-- AddForeignKey
ALTER TABLE "horses" ADD CONSTRAINT "horses_stable_id_fkey" FOREIGN KEY ("stable_id") REFERENCES "stables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing stableLocation values into Stable records
INSERT INTO "stables" ("id", "name", "updated_at")
SELECT gen_random_uuid(), "stable_location", NOW()
FROM "horses"
WHERE "stable_location" IS NOT NULL AND "stable_location" != ''
GROUP BY "stable_location"
ON CONFLICT ("name") DO NOTHING;

-- Link existing horses to their new Stable records
UPDATE "horses" h
SET "stable_id" = s."id"
FROM "stables" s
WHERE h."stable_location" = s."name"
  AND h."stable_location" IS NOT NULL
  AND h."stable_location" != '';
