ALTER TABLE job_cards
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE job_cards
  ALTER COLUMN status SET DEFAULT 'PENDING_APPROVAL';

DROP INDEX IF EXISTS job_cards_one_open_per_bus;
CREATE UNIQUE INDEX job_cards_one_open_per_bus
  ON job_cards (bus_id)
  WHERE status IN ('PENDING_APPROVAL', 'OPEN');

CREATE OR REPLACE FUNCTION reject_closed_job_card_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('CLOSED', 'CANCELLED', 'REJECTED') THEN
      RAISE EXCEPTION 'closed job cards are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'closed job cards are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'REJECTED' THEN
    RAISE EXCEPTION 'rejected job cards are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled job cards are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
