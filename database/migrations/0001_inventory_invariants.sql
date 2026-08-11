ALTER TABLE stock_documents
  ADD CONSTRAINT stock_documents_reverses_document_fk
  FOREIGN KEY (reverses_document_id) REFERENCES stock_documents(id);

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_reverses_movement_fk
  FOREIGN KEY (reverses_movement_id) REFERENCES stock_movements(id);

CREATE OR REPLACE FUNCTION reject_immutable_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER stock_movements_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE FUNCTION reject_posted_document_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'posted stock documents are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_documents_posted_immutable
BEFORE UPDATE OR DELETE ON stock_documents
FOR EACH ROW EXECUTE FUNCTION reject_posted_document_change();

CREATE OR REPLACE FUNCTION reject_posted_document_line_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status document_status;
BEGIN
  SELECT status INTO parent_status
  FROM stock_documents
  WHERE id = COALESCE(OLD.document_id, NEW.document_id);

  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'posted stock document lines are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER stock_document_lines_posted_immutable
BEFORE UPDATE OR DELETE ON stock_document_lines
FOR EACH ROW EXECUTE FUNCTION reject_posted_document_line_change();

CREATE OR REPLACE FUNCTION reject_posted_purchase_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'posted local purchases are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER local_purchases_posted_immutable
BEFORE UPDATE OR DELETE ON local_purchases
FOR EACH ROW EXECUTE FUNCTION reject_posted_purchase_change();

CREATE OR REPLACE FUNCTION reject_posted_purchase_line_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status document_status;
BEGIN
  SELECT status INTO parent_status
  FROM local_purchases
  WHERE id = COALESCE(OLD.purchase_id, NEW.purchase_id);

  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'posted local purchase lines are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER local_purchase_lines_posted_immutable
BEFORE UPDATE OR DELETE ON local_purchase_lines
FOR EACH ROW EXECUTE FUNCTION reject_posted_purchase_line_change();
