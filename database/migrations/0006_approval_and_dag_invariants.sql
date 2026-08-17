ALTER TABLE stock_documents DISABLE TRIGGER stock_documents_posted_immutable;

UPDATE stock_documents
SET supplier_id = COALESCE(
  (SELECT id FROM suppliers WHERE code = 'CEAT-LK' LIMIT 1),
  (SELECT id FROM suppliers ORDER BY code LIMIT 1)
)
WHERE type = 'TYRE_DAG_SEND' AND supplier_id IS NULL;

ALTER TABLE stock_documents ENABLE TRIGGER stock_documents_posted_immutable;

ALTER TABLE stock_documents
  DROP CONSTRAINT IF EXISTS dag_send_requires_supplier;
ALTER TABLE stock_documents
  ADD CONSTRAINT dag_send_requires_supplier
  CHECK (type <> 'TYRE_DAG_SEND' OR supplier_id IS NOT NULL);

CREATE OR REPLACE FUNCTION reject_posted_document_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('POSTED', 'PENDING_APPROVAL', 'REJECTED') THEN
      RAISE EXCEPTION 'posted, pending, and rejected stock documents cannot be deleted'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('POSTED', 'REJECTED') THEN
    RAISE EXCEPTION 'posted and rejected stock documents are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'PENDING_APPROVAL' THEN
    IF NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.store_id IS DISTINCT FROM OLD.store_id
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.bus_id IS DISTINCT FROM OLD.bus_id
      OR NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
      OR NEW.reverses_document_id IS DISTINCT FROM OLD.reverses_document_id
      OR NEW.destination_store_id IS DISTINCT FROM OLD.destination_store_id
      OR NEW.linked_document_id IS DISTINCT FROM OLD.linked_document_id
      OR NEW.business_date IS DISTINCT FROM OLD.business_date
      OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
      OR NEW.reason IS DISTINCT FROM OLD.reason
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'pending stock document identity cannot be changed'
        USING ERRCODE = '55000';
    END IF;
    IF NEW.status NOT IN ('PENDING_APPROVAL', 'POSTED', 'REJECTED') THEN
      RAISE EXCEPTION 'pending stock documents can only stay pending, post, or reject'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_posted_document_line_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status document_status;
BEGIN
  SELECT status INTO parent_status
  FROM stock_documents
  WHERE id = COALESCE(OLD.document_id, NEW.document_id);

  IF parent_status IN ('POSTED', 'PENDING_APPROVAL', 'REJECTED') THEN
    RAISE EXCEPTION 'posted, pending, and rejected stock document lines are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
