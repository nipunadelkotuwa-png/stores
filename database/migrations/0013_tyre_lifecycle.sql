-- Monotonic tyre event ordering and tyre-import idempotency.
-- Disable the immutability trigger only for this one-time backfill.

ALTER TABLE tyre_events DISABLE TRIGGER tyre_events_immutable;

ALTER TABLE tyre_events
  ADD COLUMN IF NOT EXISTS sequence bigint;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM tyre_events
)
UPDATE tyre_events AS events
SET sequence = ordered.seq
FROM ordered
WHERE events.id = ordered.id
  AND events.sequence IS NULL;

CREATE SEQUENCE IF NOT EXISTS tyre_events_sequence_seq;

DO $$
DECLARE
  max_seq bigint;
BEGIN
  SELECT MAX(sequence) INTO max_seq FROM tyre_events;
  IF max_seq IS NULL THEN
    PERFORM setval('tyre_events_sequence_seq', 1, false);
  ELSE
    PERFORM setval('tyre_events_sequence_seq', max_seq, true);
  END IF;
END $$;

ALTER TABLE tyre_events
  ALTER COLUMN sequence SET DEFAULT nextval('tyre_events_sequence_seq');

ALTER SEQUENCE tyre_events_sequence_seq OWNED BY tyre_events.sequence;

ALTER TABLE tyre_events
  ALTER COLUMN sequence SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tyre_events_sequence_unique
  ON tyre_events (sequence);

CREATE INDEX IF NOT EXISTS tyre_events_tyre_sequence_idx
  ON tyre_events (tyre_id, sequence);

ALTER TABLE tyre_events ENABLE TRIGGER tyre_events_immutable;

CREATE TABLE IF NOT EXISTS tyre_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  created_by uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  purchase_id uuid NOT NULL REFERENCES local_purchases(id),
  receipt_document_id uuid NOT NULL REFERENCES stock_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tyre_imports_idempotency_unique
  ON tyre_imports (store_id, created_by, idempotency_key);
