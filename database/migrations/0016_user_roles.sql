-- Enum labels only. Do not INSERT these values in this file:
-- pnpm db:migrate wraps each file in a transaction, and new enum labels
-- cannot be used until after COMMIT.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STORE_KEEPER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'WORKSHOP';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'VIEWER';
