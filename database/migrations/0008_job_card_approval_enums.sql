-- Enum labels only. Do not reference these values in CHECKs/INSERTs here:
-- pnpm db:migrate wraps each file in a transaction, and new enum labels
-- cannot be used until after COMMIT (PostgreSQL 12+).
ALTER TYPE job_card_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE job_card_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE tyre_event_type ADD VALUE IF NOT EXISTS 'DAG_REJECTED';
