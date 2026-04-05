-- Allow multiple planned sessions per AM/PM slot on the same day
DROP INDEX IF EXISTS "planned_sessions_horse_id_date_slot_key";
CREATE INDEX IF NOT EXISTS "planned_sessions_horse_id_date_slot_idx" ON "planned_sessions"("horse_id", "date", "slot");

-- Allow multiple actual session logs per AM/PM slot on the same day
DROP INDEX IF EXISTS "actual_session_logs_horse_id_date_slot_key";
CREATE INDEX IF NOT EXISTS "actual_session_logs_horse_id_date_slot_idx" ON "actual_session_logs"("horse_id", "date", "slot");
