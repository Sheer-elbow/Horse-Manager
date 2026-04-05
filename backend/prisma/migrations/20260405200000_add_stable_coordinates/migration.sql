-- AddColumn: latitude and longitude for weather forecast lookups
-- These are populated automatically by the geocoding service when a stable
-- address is saved. Users never set these directly.
ALTER TABLE "stables" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "stables" ADD COLUMN "longitude" DOUBLE PRECISION;
