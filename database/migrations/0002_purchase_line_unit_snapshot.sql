ALTER TABLE local_purchase_lines
  ADD COLUMN IF NOT EXISTS unit_snapshot text;

UPDATE local_purchase_lines
SET unit_snapshot = 'EA'
WHERE unit_snapshot IS NULL;

ALTER TABLE local_purchase_lines
  ALTER COLUMN unit_snapshot SET NOT NULL;
