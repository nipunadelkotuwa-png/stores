ALTER TABLE stock_documents
  ADD COLUMN IF NOT EXISTS destination_store_id uuid REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS linked_document_id uuid REFERENCES stock_documents(id),
  ADD COLUMN IF NOT EXISTS last_approval_error text,
  ADD COLUMN IF NOT EXISTS last_approval_attempted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS stock_documents_linked_unique
  ON stock_documents (linked_document_id);

CREATE INDEX IF NOT EXISTS stock_documents_status_idx
  ON stock_documents (status, type);

ALTER TABLE stock_documents
  DROP CONSTRAINT IF EXISTS transfer_out_requires_destination;
ALTER TABLE stock_documents
  ADD CONSTRAINT transfer_out_requires_destination
  CHECK (
    type <> 'TRANSFER_OUT'
    OR (destination_store_id IS NOT NULL AND destination_store_id <> store_id)
  );

ALTER TABLE stock_documents
  DROP CONSTRAINT IF EXISTS transfer_in_requires_link;
ALTER TABLE stock_documents
  ADD CONSTRAINT transfer_in_requires_link
  CHECK (type <> 'TRANSFER_IN' OR linked_document_id IS NOT NULL);

ALTER TABLE tyres
  DROP CONSTRAINT IF EXISTS tyres_in_transit_has_store;
ALTER TABLE tyres
  ADD CONSTRAINT tyres_in_transit_has_store
  CHECK (status <> 'IN_TRANSIT' OR store_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at);
