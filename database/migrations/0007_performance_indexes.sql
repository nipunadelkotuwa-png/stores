-- Performance indexes for dashboard, POS hub, and balance queries.

CREATE INDEX IF NOT EXISTS stock_documents_store_status_posted_idx
  ON stock_documents (store_id, status, posted_at);

CREATE INDEX IF NOT EXISTS stock_document_lines_part_idx
  ON stock_document_lines (part_id);

CREATE INDEX IF NOT EXISTS stock_documents_bus_idx
  ON stock_documents (bus_id)
  WHERE bus_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS parts_active_idx
  ON parts (active)
  WHERE active = true;
