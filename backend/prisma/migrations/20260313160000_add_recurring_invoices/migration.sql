-- AlterTable: add recurringInvoiceId to invoices
ALTER TABLE "invoices" ADD COLUMN "recurring_invoice_id" TEXT;

-- CreateTable: recurring_invoices
CREATE TABLE "recurring_invoices" (
    "id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'OWNER',
    "created_by_id" TEXT NOT NULL,
    "stable_id" TEXT,
    "supplier" TEXT,
    "category" TEXT NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "last_generated_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recurring_invoice_splits
CREATE TABLE "recurring_invoice_splits" (
    "id" TEXT NOT NULL,
    "recurring_invoice_id" TEXT NOT NULL,
    "horse_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_invoice_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_invoices_created_by_id_active_idx" ON "recurring_invoices"("created_by_id", "active");

-- AddForeignKey: invoices -> recurring_invoices
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_invoice_id_fkey"
    FOREIGN KEY ("recurring_invoice_id") REFERENCES "recurring_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: recurring_invoices -> users
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: recurring_invoices -> stables
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_stable_id_fkey"
    FOREIGN KEY ("stable_id") REFERENCES "stables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: recurring_invoice_splits -> recurring_invoices
ALTER TABLE "recurring_invoice_splits" ADD CONSTRAINT "recurring_invoice_splits_recurring_invoice_id_fkey"
    FOREIGN KEY ("recurring_invoice_id") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: recurring_invoice_splits -> horses
ALTER TABLE "recurring_invoice_splits" ADD CONSTRAINT "recurring_invoice_splits_horse_id_fkey"
    FOREIGN KEY ("horse_id") REFERENCES "horses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: recurring_invoice_splits -> users
ALTER TABLE "recurring_invoice_splits" ADD CONSTRAINT "recurring_invoice_splits_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
