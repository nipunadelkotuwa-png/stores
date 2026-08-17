-- Enum labels only. Do not reference these values in CHECKs/INSERTs here:
-- pnpm db:migrate wraps each file in a transaction, and new enum labels
-- cannot be used until after COMMIT (PostgreSQL 12+).
ALTER TYPE tyre_lifecycle_stage ADD VALUE IF NOT EXISTS 'REBUILD';
ALTER TYPE tyre_asset_status ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE tyre_asset_status ADD VALUE IF NOT EXISTS 'DISPOSED';
ALTER TYPE tyre_event_type ADD VALUE IF NOT EXISTS 'DISPOSE';
ALTER TYPE tyre_event_type ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE tyre_event_type ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE stock_document_type ADD VALUE IF NOT EXISTS 'TYRE_DISPOSAL';
ALTER TYPE stock_document_type ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE stock_document_type ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'REJECTED';
