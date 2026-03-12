-- CreateTable
CREATE TABLE "dentist_visits" (
    "id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentist_visits_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dentist_visits" ADD CONSTRAINT "dentist_visits_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
