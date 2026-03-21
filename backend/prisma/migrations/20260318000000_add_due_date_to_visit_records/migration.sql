-- Add due_date column to vet_visits, farrier_visits, dentist_visits

ALTER TABLE "vet_visits"     ADD COLUMN "due_date" DATE;
ALTER TABLE "farrier_visits" ADD COLUMN "due_date" DATE;
ALTER TABLE "dentist_visits" ADD COLUMN "due_date" DATE;
