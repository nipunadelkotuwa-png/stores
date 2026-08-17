ALTER TABLE tyre_events
  ADD CONSTRAINT tyre_events_stock_document_fk
  FOREIGN KEY (stock_document_id) REFERENCES stock_documents(id);

ALTER TABLE oil_changes
  ADD CONSTRAINT oil_changes_stock_document_fk
  FOREIGN KEY (stock_document_id) REFERENCES stock_documents(id);

CREATE TRIGGER tyre_events_immutable
BEFORE UPDATE OR DELETE ON tyre_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER oil_changes_immutable
BEFORE UPDATE OR DELETE ON oil_changes
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE FUNCTION reject_closed_job_card_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('CLOSED', 'CANCELLED') THEN
      RAISE EXCEPTION 'closed job cards are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'closed job cards are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled job cards are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER job_cards_closed_immutable
BEFORE UPDATE OR DELETE ON job_cards
FOR EACH ROW EXECUTE FUNCTION reject_closed_job_card_change();
