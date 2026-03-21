-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('OWNER', 'STABLE');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'OWNER',
    "created_by_id" TEXT NOT NULL,
    "stable_id" TEXT,
    "supplier" TEXT,
    "category" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_splits" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_created_by_id_date_idx" ON "invoices"("created_by_id", "date");

-- CreateIndex
CREATE INDEX "invoices_stable_id_date_idx" ON "invoices"("stable_id", "date");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_stable_id_fkey" FOREIGN KEY ("stable_id") REFERENCES "stables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_splits" ADD CONSTRAINT "invoice_splits_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_splits" ADD CONSTRAINT "invoice_splits_horse_id_fkey" FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_splits" ADD CONSTRAINT "invoice_splits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
