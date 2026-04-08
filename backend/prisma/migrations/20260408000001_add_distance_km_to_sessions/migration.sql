-- Add optional distance field to session logs
ALTER TABLE "actual_session_logs" ADD COLUMN "distance_km" DOUBLE PRECISION;
