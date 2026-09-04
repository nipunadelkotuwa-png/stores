-- Fleet lifecycle: ACTIVE / INACTIVE / SOLD, plus sale metadata.
-- Keep buses.active boolean in sync as the operational selector cache.

CREATE TYPE bus_status AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD');

UPDATE buses
SET status = 'ACTIVE'
WHERE status IS NULL
   OR status NOT IN ('ACTIVE', 'INACTIVE', 'SOLD');

UPDATE buses SET active = true WHERE status = 'ACTIVE';
UPDATE buses SET active = false WHERE status IN ('INACTIVE', 'SOLD');

ALTER TABLE buses
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE buses
  ALTER COLUMN status TYPE bus_status
  USING status::bus_status;

ALTER TABLE buses
  ALTER COLUMN status SET DEFAULT 'ACTIVE'::bus_status;

ALTER TABLE buses
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_reason text,
  ADD COLUMN IF NOT EXISTS sold_by_user_id uuid REFERENCES users(id);

ALTER TABLE buses
  DROP CONSTRAINT IF EXISTS buses_active_matches_status;
ALTER TABLE buses
  ADD CONSTRAINT buses_active_matches_status
  CHECK (
    (status = 'ACTIVE' AND active)
    OR (status IN ('INACTIVE', 'SOLD') AND NOT active)
  );
