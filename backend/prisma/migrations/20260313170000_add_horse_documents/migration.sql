-- CreateTable: horse_documents
CREATE TABLE "horse_documents" (
  "id"            TEXT NOT NULL,
  "horse_id"      TEXT NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT 'Other',
  "file_url"      TEXT NOT NULL,
  "file_name"     TEXT NOT NULL,
  "expires_at"    DATE,
  "notes"         TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "horse_documents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "horse_documents"
  ADD CONSTRAINT "horse_documents_horse_id_fkey"
  FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "horse_documents"
  ADD CONSTRAINT "horse_documents_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "horse_documents_horse_id_category_idx" ON "horse_documents"("horse_id", "category");
CREATE INDEX "horse_documents_expires_at_idx" ON "horse_documents"("expires_at");
