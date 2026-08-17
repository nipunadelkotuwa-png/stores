-- Demo workshop/inventory rows. Safe to re-run: skips when seed documents already exist.
-- Document numbers use 2026-8xxxxx so they do not collide with UI sequences (000001+).

CREATE OR REPLACE FUNCTION seed_apply_line(
  p_doc uuid,
  p_line integer,
  p_sku text,
  p_qty numeric,
  p_cost numeric,
  p_delta numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_store uuid;
  v_when timestamptz;
  v_part uuid;
  v_sku text;
  v_name text;
  v_unit text;
  v_line uuid;
  v_bal numeric;
BEGIN
  SELECT store_id, occurred_at INTO v_store, v_when FROM stock_documents WHERE id = p_doc;
  SELECT id, sku, name, unit
    INTO v_part, v_sku, v_name, v_unit
  FROM parts
  WHERE sku = p_sku;
  IF v_part IS NULL THEN
    RAISE EXCEPTION 'Seed part % is missing', p_sku;
  END IF;

  INSERT INTO seed_bal (store_id, part_id, qty)
  VALUES (v_store, v_part, 0)
  ON CONFLICT (store_id, part_id) DO NOTHING;

  UPDATE seed_bal
  SET qty = qty + p_delta
  WHERE store_id = v_store AND part_id = v_part
  RETURNING qty INTO v_bal;

  IF v_bal < 0 THEN
    RAISE EXCEPTION 'Seed stock would go negative for % at store %', p_sku, v_store;
  END IF;

  INSERT INTO stock_document_lines (
    document_id, line_number, part_id, quantity, unit_cost,
    sku_snapshot, name_snapshot, unit_snapshot
  )
  VALUES (p_doc, p_line, v_part, p_qty, p_cost, v_sku, v_name, v_unit)
  RETURNING id INTO v_line;

  INSERT INTO stock_movements (
    document_id, document_line_id, store_id, part_id,
    quantity_delta, balance_after, occurred_at
  )
  VALUES (p_doc, v_line, v_store, v_part, p_delta, v_bal, v_when);
END;
$$;

CREATE TEMP TABLE IF NOT EXISTS seed_bal (
  store_id uuid NOT NULL,
  part_id uuid NOT NULL,
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, part_id)
);

DO $$
DECLARE
  admin_id uuid;
  cmb uuid;
  kdy uuid;
  supplier_local uuid;
  supplier_ceat uuid;
  doc_id uuid;
  job1 uuid;
  job2 uuid;
  job3 uuid;
  job_open uuid;
  purchase_id uuid;
  bus1 uuid;
  bus2 uuid;
  bus3 uuid;
  bus4 uuid;
  v_tyre uuid;
  tds_id uuid;
  tdr_id uuid;
  oil_part uuid;
  org_part uuid;
  dag1_part uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_documents WHERE idempotency_key LIKE 'seed:%'
  ) THEN
    RAISE NOTICE 'Mock demo data already present — skipping ledger seed';
    RETURN;
  END IF;

  SELECT id INTO admin_id FROM users WHERE email = 'admin@dsgunasekara.local';
  SELECT id INTO cmb FROM stores WHERE code = 'CMB';
  SELECT id INTO kdy FROM stores WHERE code = 'KDY';
  SELECT id INTO supplier_local FROM suppliers WHERE code = 'LOCAL-001';
  SELECT id INTO supplier_ceat FROM suppliers WHERE code = 'CEAT-LK';
  SELECT id INTO bus1 FROM buses WHERE fleet_number = 'BUS-001';
  SELECT id INTO bus2 FROM buses WHERE fleet_number = 'BUS-002';
  SELECT id INTO bus3 FROM buses WHERE fleet_number = 'BUS-003';
  SELECT id INTO bus4 FROM buses WHERE fleet_number = 'BUS-004';
  SELECT id INTO org_part FROM parts WHERE sku = 'TR-ORG-295';
  SELECT id INTO dag1_part FROM parts WHERE sku = 'TR-DAG1-295';
  SELECT id INTO oil_part FROM parts WHERE sku = 'OIL-15W40';

  INSERT INTO seed_bal (store_id, part_id, qty)
  SELECT store_id, part_id, on_hand FROM inventory_balances
  ON CONFLICT (store_id, part_id) DO NOTHING;

  INSERT INTO job_cards (
    job_number, store_id, bus_id, status, business_date, odometer_km,
    complaint, work_done, mechanic_name, notes, opened_by, opened_at,
    closed_by, closed_at
  )
  VALUES
    (
      'JC-CMB-2026-800001', cmb, bus1, 'CLOSED', '2026-08-05', 148220,
      'Oil leak and worn front tyres',
      'Changed engine oil and filter. Fitted two new original tyres on the front axle.',
      'Nimal Perera', 'Service at Colombo workshop',
      admin_id, '2026-08-05 08:15+05:30', admin_id, '2026-08-05 16:40+05:30'
    ),
    (
      'JC-CMB-2026-800002', cmb, bus2, 'CLOSED', '2026-08-08', 121450,
      'Noisy front brakes',
      'Replaced front brake pad set and road-tested.',
      'Sunil Fernando', NULL,
      admin_id, '2026-08-08 09:00+05:30', admin_id, '2026-08-08 13:20+05:30'
    ),
    (
      'JC-KDY-2026-800001', kdy, bus4, 'CLOSED', '2026-08-10', 98010,
      'Alternator belt squeal',
      'Fitted new alternator belt.',
      'Kamal Jayasuriya', NULL,
      admin_id, '2026-08-10 10:00+05:30', admin_id, '2026-08-10 12:15+05:30'
    ),
    (
      'JC-CMB-2026-800003', cmb, bus3, 'OPEN', '2026-08-17', 110880,
      'Clutch slip on hills and engine running hot',
      NULL, 'Nimal Perera', 'Bus in workshop — awaiting parts',
      admin_id, '2026-08-17 07:50+05:30', NULL, NULL
    );

  SELECT id INTO job1 FROM job_cards WHERE job_number = 'JC-CMB-2026-800001';
  SELECT id INTO job2 FROM job_cards WHERE job_number = 'JC-CMB-2026-800002';
  SELECT id INTO job3 FROM job_cards WHERE job_number = 'JC-KDY-2026-800001';
  SELECT id INTO job_open FROM job_cards WHERE job_number = 'JC-CMB-2026-800003';

  INSERT INTO job_card_sequences (store_id, year, next_value)
  VALUES (cmb, 2026, 1), (kdy, 2026, 1)
  ON CONFLICT (store_id, year) DO NOTHING;

  -- Opening receipts
  INSERT INTO stock_documents (
    document_number, type, status, store_id, supplier_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'SIN-CMB-2026-800001', 'STOCK_RECEIPT', 'POSTED', cmb, supplier_local,
    '2026-08-01', 'Opening stock — Colombo', 'seed:sin-cmb-opening',
    admin_id, admin_id, '2026-08-01 09:00+05:30', '2026-08-01 09:00+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'OIL-FILTER-01', 40, 1850, 40);
  PERFORM seed_apply_line(doc_id, 2, 'FUEL-FILTER-01', 24, 2100, 24);
  PERFORM seed_apply_line(doc_id, 3, 'AIR-FILTER-01', 18, 3200, 18);
  PERFORM seed_apply_line(doc_id, 4, 'BRAKE-PAD-F', 8, 12500, 8);
  PERFORM seed_apply_line(doc_id, 5, 'BRAKE-PAD-R', 6, 11800, 6);
  PERFORM seed_apply_line(doc_id, 6, 'ALT-BELT-01', 20, 2800, 20);
  PERFORM seed_apply_line(doc_id, 7, 'BATTERY-12V', 6, 42000, 6);
  PERFORM seed_apply_line(doc_id, 8, 'OIL-15W40', 240, 890, 240);
  PERFORM seed_apply_line(doc_id, 9, 'OIL-GEAR-90', 60, 760, 60);
  PERFORM seed_apply_line(doc_id, 10, 'TR-ORG-295', 16, 48500, 16);
  PERFORM seed_apply_line(doc_id, 11, 'TR-DAG1-295', 4, 22000, 4);
  PERFORM seed_apply_line(doc_id, 12, 'BRAKE-SHOES-R', 3, 9800, 3);
  PERFORM seed_apply_line(doc_id, 13, 'HEADLAMP-L', 2, 18500, 2);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, supplier_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'SIN-KDY-2026-800001', 'STOCK_RECEIPT', 'POSTED', kdy, supplier_local,
    '2026-08-02', 'Opening stock — Kandy', 'seed:sin-kdy-opening',
    admin_id, admin_id, '2026-08-02 10:00+05:30', '2026-08-02 10:00+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'OIL-FILTER-01', 16, 1850, 16);
  PERFORM seed_apply_line(doc_id, 2, 'BRAKE-PAD-F', 4, 12500, 4);
  PERFORM seed_apply_line(doc_id, 3, 'ALT-BELT-01', 8, 2800, 8);
  PERFORM seed_apply_line(doc_id, 4, 'OIL-15W40', 80, 890, 80);
  PERFORM seed_apply_line(doc_id, 5, 'TR-ORG-295', 6, 48500, 6);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, supplier_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'SIN-CMB-2026-800002', 'STOCK_RECEIPT', 'POSTED', cmb, supplier_ceat,
    '2026-08-04', 'Ceat tyre delivery', 'seed:sin-cmb-ceat',
    admin_id, admin_id, '2026-08-04 11:30+05:30', '2026-08-04 11:30+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'TR-ORG-295', 4, 48500, 4);

  INSERT INTO local_purchases (
    purchase_number, store_id, supplier_id, receipt_document_id,
    supplier_name_snapshot, supplier_invoice_reference, business_date,
    currency, subtotal, discount, tax, total, status, notes,
    idempotency_key, created_by, posted_by, posted_at
  ) VALUES (
    'PO-CMB-2026-800001', cmb, supplier_ceat, doc_id,
    'Ceat Kelani Tyres', 'INV-CEAT-88421', '2026-08-04',
    'LKR', 194000, 0, 0, 194000, 'POSTED', 'Tyre delivery linked to stock-in',
    'seed:po-cmb-ceat', admin_id, admin_id, '2026-08-04 11:30+05:30'
  )
  RETURNING id INTO purchase_id;

  INSERT INTO local_purchase_lines (
    purchase_id, line_number, part_id, quantity, unit_price, line_total,
    sku_snapshot, name_snapshot, unit_snapshot
  )
  SELECT purchase_id, 1, id, 4, 48500, 194000, sku, name, unit
  FROM parts WHERE sku = 'TR-ORG-295';

  -- Job card issues / oil
  INSERT INTO stock_documents (
    document_number, type, status, store_id, bus_id, job_card_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'ISS-CMB-2026-800001', 'BUS_ISSUE', 'POSTED', cmb, bus1, job1, '2026-08-05',
    'Service parts for BUS-001', 'seed:iss-cmb-bus001',
    admin_id, admin_id, '2026-08-05 11:00+05:30', '2026-08-05 11:00+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'OIL-FILTER-01', 1, NULL, -1);
  PERFORM seed_apply_line(doc_id, 2, 'OIL-15W40', 18, NULL, -18);
  PERFORM seed_apply_line(doc_id, 3, 'TR-ORG-295', 2, NULL, -2);

  INSERT INTO oil_changes (
    job_card_id, bus_id, part_id, stock_document_id, litres, odometer_km,
    business_date, notes, created_by, created_at
  )
  VALUES (
    job1, bus1, oil_part, doc_id, 18, 148220, '2026-08-05',
    'Full sump change', admin_id, '2026-08-05 11:05+05:30'
  );

  INSERT INTO stock_documents (
    document_number, type, status, store_id, bus_id, job_card_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'ISS-CMB-2026-800002', 'BUS_ISSUE', 'POSTED', cmb, bus2, job2, '2026-08-08',
    'Front pads', 'seed:iss-cmb-bus002',
    admin_id, admin_id, '2026-08-08 10:30+05:30', '2026-08-08 10:30+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'BRAKE-PAD-F', 1, NULL, -1);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, bus_id, job_card_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'ISS-KDY-2026-800001', 'BUS_ISSUE', 'POSTED', kdy, bus4, job3, '2026-08-10',
    'Belt replacement', 'seed:iss-kdy-bus004',
    admin_id, admin_id, '2026-08-10 11:00+05:30', '2026-08-10 11:00+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'ALT-BELT-01', 1, NULL, -1);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, bus_id, job_card_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'ISS-CMB-2026-800003', 'BUS_ISSUE', 'POSTED', cmb, bus1, job1, '2026-08-05',
    'Remaining axle + spare tyres', 'seed:iss-cmb-bus001-tyres',
    admin_id, admin_id, '2026-08-05 14:00+05:30', '2026-08-05 14:00+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'TR-ORG-295', 5, NULL, -5);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, bus_id, job_card_id, business_date,
    notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'ISS-CMB-2026-800004', 'BUS_ISSUE', 'POSTED', cmb, bus3, job_open, '2026-08-17',
    'Diagnostic parts while awaiting clutch kit', 'seed:iss-cmb-bus003-open',
    admin_id, admin_id, '2026-08-17 08:40+05:30', '2026-08-17 08:40+05:30'
  )
  RETURNING id INTO doc_id;
  PERFORM seed_apply_line(doc_id, 1, 'OIL-FILTER-01', 1, NULL, -1);
  PERFORM seed_apply_line(doc_id, 2, 'AIR-FILTER-01', 1, NULL, -1);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, supplier_id, business_date, reason, notes,
    idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'TDS-CMB-2026-800001', 'TYRE_DAG_SEND', 'POSTED', cmb, supplier_ceat, '2026-08-12',
    'DAG send SN-ORG-1015 SN-ORG-1016', 'Worn casings to retread',
    'seed:tds-cmb-pair',
    admin_id, admin_id, '2026-08-12 09:30+05:30', '2026-08-12 09:30+05:30'
  )
  RETURNING id INTO tds_id;
  PERFORM seed_apply_line(tds_id, 1, 'TR-ORG-295', 2, NULL, -2);

  INSERT INTO stock_documents (
    document_number, type, status, store_id, business_date, reason, notes,
    idempotency_key, created_by, posted_by, posted_at, occurred_at
  ) VALUES (
    'TDR-CMB-2026-800001', 'TYRE_DAG_RECEIVE', 'POSTED', cmb, '2026-08-15',
    'DAG receive SN-ORG-1015 as DAG1', 'Returned from retread plant',
    'seed:tdr-cmb-1015',
    admin_id, admin_id, '2026-08-15 15:00+05:30', '2026-08-15 15:00+05:30'
  )
  RETURNING id INTO tdr_id;
  PERFORM seed_apply_line(tdr_id, 1, 'TR-DAG1-295', 1, NULL, 1);

  INSERT INTO inventory_balances (store_id, part_id, on_hand, updated_at)
  SELECT store_id, part_id, qty, now() FROM seed_bal
  ON CONFLICT (store_id, part_id) DO UPDATE SET
    on_hand = EXCLUDED.on_hand,
    updated_at = now();

  -- Serial tyres: 16 ORG received at CMB; 7 fitted on BUS-001; 2 sent DAG; 1 back as DAG1
  INSERT INTO tyres (
    serial_number, part_id, lifecycle_stage, status, store_id,
    current_bus_id, current_position, notes
  )
  SELECT
    serial,
    CASE WHEN serial = 'SN-ORG-1015' THEN dag1_part ELSE org_part END,
    CASE WHEN serial = 'SN-ORG-1015' THEN 'DAG1'::tyre_lifecycle_stage ELSE 'ORG'::tyre_lifecycle_stage END,
    status::tyre_asset_status,
    CASE WHEN status = 'FITTED' THEN NULL ELSE cmb END,
    CASE WHEN status = 'FITTED' THEN bus1 ELSE NULL END,
    pos,
    NULL
  FROM (
    VALUES
      ('SN-ORG-1001', 'FITTED', 'FL'::tyre_position),
      ('SN-ORG-1002', 'FITTED', 'FR'::tyre_position),
      ('SN-ORG-1003', 'FITTED', 'RLI'::tyre_position),
      ('SN-ORG-1004', 'FITTED', 'RLO'::tyre_position),
      ('SN-ORG-1005', 'FITTED', 'RRI'::tyre_position),
      ('SN-ORG-1006', 'FITTED', 'RRO'::tyre_position),
      ('SN-ORG-1007', 'FITTED', 'SPARE'::tyre_position),
      ('SN-ORG-1008', 'IN_STORE', NULL),
      ('SN-ORG-1009', 'IN_STORE', NULL),
      ('SN-ORG-1010', 'IN_STORE', NULL),
      ('SN-ORG-1011', 'IN_STORE', NULL),
      ('SN-ORG-1012', 'IN_STORE', NULL),
      ('SN-ORG-1013', 'IN_STORE', NULL),
      ('SN-ORG-1014', 'IN_STORE', NULL),
      ('SN-ORG-1015', 'IN_STORE', NULL),
      ('SN-ORG-1016', 'AT_DAG', NULL)
  ) AS t(serial, status, pos)
  ON CONFLICT (serial_number) DO NOTHING;

  INSERT INTO tyre_events (
    tyre_id, type, job_card_id, store_id, bus_id, to_position, to_stage,
    odometer_km, created_by, occurred_at
  )
  SELECT
    ty.id, 'REGISTER', NULL, cmb, NULL, NULL, ty.lifecycle_stage, NULL,
    admin_id, '2026-08-04 12:00+05:30'
  FROM tyres ty
  WHERE ty.serial_number LIKE 'SN-ORG-%'
    AND NOT EXISTS (
      SELECT 1 FROM tyre_events e WHERE e.tyre_id = ty.id AND e.type = 'REGISTER'
    );

  INSERT INTO tyre_events (
    tyre_id, type, job_card_id, store_id, bus_id, to_position, to_stage,
    odometer_km, created_by, occurred_at
  )
  SELECT
    ty.id, 'FIT', job1, cmb, bus1, ty.current_position, 'ORG', 148220,
    admin_id, '2026-08-05 14:10+05:30'
  FROM tyres ty
  WHERE ty.status = 'FITTED' AND ty.current_bus_id = bus1
    AND NOT EXISTS (
      SELECT 1 FROM tyre_events e WHERE e.tyre_id = ty.id AND e.type = 'FIT'
    );

  SELECT id INTO v_tyre FROM tyres WHERE serial_number = 'SN-ORG-1016';
  INSERT INTO tyre_events (
    tyre_id, type, stock_document_id, store_id, from_stage, created_by, occurred_at, notes
  )
  SELECT v_tyre, 'SEND_DAG', tds_id, cmb, 'ORG', admin_id, '2026-08-12 09:35+05:30',
    'Sent with SN-ORG-1015'
  WHERE NOT EXISTS (
    SELECT 1 FROM tyre_events e WHERE e.tyre_id = v_tyre AND e.type = 'SEND_DAG'
  );

  SELECT id INTO v_tyre FROM tyres WHERE serial_number = 'SN-ORG-1015';
  INSERT INTO tyre_events (
    tyre_id, type, stock_document_id, store_id, from_stage, created_by, occurred_at
  )
  SELECT v_tyre, 'SEND_DAG', tds_id, cmb, 'ORG', admin_id, '2026-08-12 09:35+05:30'
  WHERE NOT EXISTS (
    SELECT 1 FROM tyre_events e WHERE e.tyre_id = v_tyre AND e.type = 'SEND_DAG'
  );
  INSERT INTO tyre_events (
    tyre_id, type, stock_document_id, store_id, from_stage, to_stage, created_by, occurred_at
  )
  SELECT v_tyre, 'RECEIVE_DAG', tdr_id, cmb, 'ORG', 'DAG1', admin_id, '2026-08-15 15:05+05:30'
  WHERE NOT EXISTS (
    SELECT 1 FROM tyre_events e WHERE e.tyre_id = v_tyre AND e.type = 'RECEIVE_DAG'
  );

  INSERT INTO audit_events (
    actor_id, event_type, entity_type, entity_id, store_id, metadata
  )
  SELECT admin_id, 'JOB_CARD_OPENED', 'job_card', id, store_id,
    jsonb_build_object('jobNumber', job_number)
  FROM job_cards
  WHERE job_number LIKE 'JC-%-2026-8%'
    AND NOT EXISTS (
      SELECT 1 FROM audit_events a
      WHERE a.entity_type = 'job_card' AND a.entity_id = job_cards.id::text
    );

  INSERT INTO audit_events (
    actor_id, event_type, entity_type, entity_id, store_id, metadata
  )
  SELECT admin_id, 'INVENTORY_POSTED', 'stock_document', id, store_id,
    jsonb_build_object('documentNumber', document_number, 'type', type)
  FROM stock_documents
  WHERE idempotency_key LIKE 'seed:%'
    AND NOT EXISTS (
      SELECT 1 FROM audit_events a
      WHERE a.entity_type = 'stock_document' AND a.entity_id = stock_documents.id::text
    );
END;
$$;

DROP FUNCTION seed_apply_line(uuid, integer, text, numeric, numeric, numeric);
