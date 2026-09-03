-- Backfill DAG receive → send links where possible.
WITH linked AS (
  SELECT DISTINCT ON (recv.stock_document_id)
    recv.stock_document_id AS receive_id,
    send.stock_document_id AS send_id
  FROM tyre_events recv
  JOIN tyre_events send
    ON send.tyre_id = recv.tyre_id
   AND send.type = 'SEND_DAG'
   AND send.stock_document_id IS NOT NULL
   AND send.occurred_at <= recv.occurred_at
  WHERE recv.type = 'RECEIVE_DAG'
    AND recv.stock_document_id IS NOT NULL
  ORDER BY recv.stock_document_id, send.occurred_at DESC
)
UPDATE stock_documents d
SET linked_document_id = linked.send_id
FROM linked
WHERE d.id = linked.receive_id
  AND d.type = 'TYRE_DAG_RECEIVE'
  AND d.linked_document_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_documents x WHERE x.linked_document_id = linked.send_id
  );

ALTER TABLE stock_documents
  DROP CONSTRAINT IF EXISTS dag_receive_requires_link;

-- NOT VALID keeps any remaining legacy unlinked rows; new inserts/updates are enforced.
ALTER TABLE stock_documents
  ADD CONSTRAINT dag_receive_requires_link
  CHECK (type <> 'TYRE_DAG_RECEIVE' OR linked_document_id IS NOT NULL) NOT VALID;
