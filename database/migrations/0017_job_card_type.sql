DO $$ BEGIN
  CREATE TYPE job_card_type AS ENUM ('TRANSPORT', 'TOURISM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE job_cards
  ADD COLUMN IF NOT EXISTS type job_card_type NOT NULL DEFAULT 'TRANSPORT';

ALTER TABLE job_card_sequences
  ADD COLUMN IF NOT EXISTS type job_card_type NOT NULL DEFAULT 'TRANSPORT';

DROP INDEX IF EXISTS job_card_sequences_store_year_unique;

CREATE UNIQUE INDEX IF NOT EXISTS job_card_sequences_store_year_type_unique
  ON job_card_sequences (store_id, year, type);
