-- Add practitioner name and visit reason to vet_visits
ALTER TABLE "vet_visits" ADD COLUMN "vet_name" TEXT;
ALTER TABLE "vet_visits" ADD COLUMN "visit_reason" TEXT;

-- Add practitioner name to farrier_visits
ALTER TABLE "farrier_visits" ADD COLUMN "farrier_name" TEXT;

-- Add practitioner name to dentist_visits
ALTER TABLE "dentist_visits" ADD COLUMN "dentist_name" TEXT;

-- Add category to expense_notes
ALTER TABLE "expense_notes" ADD COLUMN "category" TEXT;
