import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { hashPassword } from "../../app/lib/auth/password.server";
import { skhPartsSchema } from "./sk-h-schema";

if (process.env.NODE_ENV === "production")
  throw new Error("Development seed cannot run in production");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const password = process.env.DEV_ADMIN_PASSWORD ?? "ChangeMe123!";
const passwordHash = await hashPassword(password);
const client = new Client({ connectionString: url });
const seedDir = path.dirname(fileURLToPath(import.meta.url));
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO stores (code, name, address, phone)
    VALUES
      ('CMB', 'Colombo Central Store', 'Peliyagoda, Colombo', '011-2-934100'),
      ('KDY', 'Kandy Store', 'Katugastota, Kandy', '081-2-221450')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone
  `);
  await client.query(
    `
    INSERT INTO users (email, display_name, password_hash, role, must_change_password)
    VALUES ('admin@dsgunasekara.local', 'System Administrator', $1, 'ADMIN', true)
    ON CONFLICT (email) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      role = 'ADMIN',
      status = 'ACTIVE'
  `,
    [passwordHash],
  );
  await client.query(
    `
    INSERT INTO users (email, display_name, password_hash, role, must_change_password)
    VALUES ('operator@dsgunasekara.local', 'Colombo Operator', $1, 'OPERATOR', false)
    ON CONFLICT (email) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      role = 'OPERATOR',
      status = 'ACTIVE'
  `,
    [passwordHash],
  );
  await client.query(`
    INSERT INTO user_store_assignments (user_id, store_id, assigned_by)
    SELECT u.id, s.id, a.id
    FROM users u
    JOIN stores s ON s.code = 'CMB'
    JOIN users a ON a.email = 'admin@dsgunasekara.local'
    WHERE u.email = 'operator@dsgunasekara.local'
    ON CONFLICT (user_id, store_id) DO NOTHING
  `);
  await client.query(`
    INSERT INTO part_categories (code, name)
    VALUES
      ('ENGINE', 'Engine'),
      ('BRAKE', 'Brakes'),
      ('ELECTRICAL', 'Electrical'),
      ('TYRE', 'Tyres'),
      ('OIL', 'Oil'),
      ('FILTER', 'Filters'),
      ('AC', 'Air conditioning'),
      ('BODY', 'Body'),
      ('SUSPENSION', 'Suspension'),
      ('TRANSMISSION', 'Transmission')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  `);
  await client.query(`
    INSERT INTO suppliers (code, name, phone, address)
    VALUES
      ('LOCAL-001', 'Local Supplier', '011-2-555010', 'Pettah, Colombo'),
      ('CEAT-LK', 'Ceat Kelani Tyres', '011-2-934800', 'Kelaniya'),
      ('LANKA-OIL', 'Lanka IOC Lubricants', '011-2-473000', 'Kolonnawa')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(`
    INSERT INTO buses (fleet_number, registration_number, make, model, home_store_id)
    SELECT v.fleet, v.reg, v.make, v.model, s.id
    FROM (
      VALUES
        ('BUS-001', 'WP-NA-0001', 'Ashok Leyland', 'Viking', 'CMB'),
        ('BUS-002', 'WP-NA-2145', 'Ashok Leyland', 'Viking', 'CMB'),
        ('BUS-003', 'CP-NA-3321', 'Tata', 'LP 1613', 'CMB'),
        ('BUS-004', 'KY-NA-1188', 'Ashok Leyland', 'Viking', 'KDY'),
        ('BUS-005', 'WP-ND-4420', 'Lanka Ashok Leyland', 'Lynx', 'CMB'),
        ('BUS-006', 'NW-NA-0901', 'Tata', 'LP 1512', 'KDY')
    ) AS v(fleet, reg, make, model, store_code)
    JOIN stores s ON s.code = v.store_code
    ON CONFLICT (fleet_number) DO NOTHING
  `);

  const catalogue = [
    [
      "ENGINE",
      "OIL-FILTER-01",
      "Engine oil filter",
      "EA",
      "FleetGuard",
      "8901000000011",
    ],
    [
      "ENGINE",
      "FUEL-FILTER-01",
      "Fuel filter",
      "EA",
      "FleetGuard",
      "8901000000028",
    ],
    ["ENGINE", "AIR-FILTER-01", "Air filter", "EA", "Mann", "8901000000035"],
    [
      "BRAKE",
      "BRAKE-PAD-F",
      "Front brake pad set",
      "SET",
      "WVA",
      "8901000000103",
    ],
    [
      "BRAKE",
      "BRAKE-PAD-R",
      "Rear brake pad set",
      "SET",
      "WVA",
      "8901000000110",
    ],
    [
      "BRAKE",
      "BRAKE-SHOES-R",
      "Rear brake shoe set",
      "SET",
      "TVS",
      "8901000000127",
    ],
    [
      "ELECTRICAL",
      "ALT-BELT-01",
      "Alternator belt",
      "EA",
      "Gates",
      "8901000000202",
    ],
    [
      "ELECTRICAL",
      "BATTERY-12V",
      "12V 150Ah battery",
      "EA",
      "Amaron",
      "8901000000219",
    ],
    [
      "ELECTRICAL",
      "HEADLAMP-L",
      "Headlamp assembly LH",
      "EA",
      "Bosch",
      "8901000000226",
    ],
    [
      "TYRE",
      "TR-ORG-295",
      "295/80R22.5 original tyre",
      "EA",
      "Ceat",
      "8901000000301",
    ],
    [
      "TYRE",
      "TR-DAG1-295",
      "295/80R22.5 DAG1 retread",
      "EA",
      "Ceat",
      "8901000000318",
    ],
    [
      "TYRE",
      "TR-DAG2-295",
      "295/80R22.5 DAG2 retread",
      "EA",
      "Ceat",
      "8901000000325",
    ],
    [
      "TYRE",
      "TR-DAG3-295",
      "295/80R22.5 DAG3 retread",
      "EA",
      "Ceat",
      "8901000000332",
    ],
    [
      "TYRE",
      "TR-REBUILD-295",
      "295/80R22.5 rebuild casing",
      "EA",
      "Ceat",
      "8901000000349",
    ],
    [
      "OIL",
      "OIL-15W40",
      "Engine oil 15W-40",
      "L",
      "FleetGuard",
      "8901000000400",
    ],
    ["OIL", "OIL-GEAR-90", "Gear oil 90", "L", "Lanka IOC", "8901000000417"],
  ] as const;

  for (const [category, sku, name, unit, brand, barcode] of catalogue) {
    await client.query(
      `
      INSERT INTO parts (sku, name, unit, brand, barcode, category_id)
      SELECT $1, $2, $3, $4, $5, id
      FROM part_categories WHERE code = $6
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        unit = EXCLUDED.unit,
        brand = EXCLUDED.brand,
        barcode = EXCLUDED.barcode,
        category_id = EXCLUDED.category_id,
        active = true
    `,
      [sku, name, unit, brand, barcode, category],
    );
  }

  const skhParts = skhPartsSchema.parse(
    JSON.parse(await readFile(path.join(seedDir, "sk-h-parts.json"), "utf8")),
  );

  await client.query(
    `
    INSERT INTO parts (
      sku, name, unit, brand, description, compatible_models, category_id
    )
    SELECT
      v.sku, v.name, v.unit, v.brand, v.description, v.compatible_models, c.id
    FROM jsonb_to_recordset($1::jsonb) AS v(
      sku text, name text, unit text, brand text, category text,
      description text, compatible_models text
    )
    JOIN part_categories c ON c.code = v.category
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      brand = EXCLUDED.brand,
      description = EXCLUDED.description,
      compatible_models = EXCLUDED.compatible_models,
      category_id = EXCLUDED.category_id,
      active = true
  `,
    [
      JSON.stringify(
        skhParts.map((item) => ({
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          brand: item.brand,
          category: item.category,
          description: item.description,
          compatible_models: item.compatibleModels,
        })),
      ),
    ],
  );
  const skhInserted = await client.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM parts WHERE sku LIKE 'SKH-%'`,
  );
  if (Number(skhInserted.rows[0]?.n) !== skhParts.length) {
    throw new Error(
      `SK-H seed expected ${skhParts.length} parts, found ${skhInserted.rows[0]?.n}`,
    );
  }
  await client.query(`
    DELETE FROM part_categories c
    WHERE c.code = 'SK-H'
      AND NOT EXISTS (SELECT 1 FROM parts p WHERE p.category_id = c.id)
  `);

  await client.query(`
    INSERT INTO store_part_settings (store_id, part_id, reorder_level, bin_location)
    SELECT s.id, p.id, levels.reorder_level::numeric(14,3), levels.bin_location
    FROM stores s
    CROSS JOIN parts p
    CROSS JOIN LATERAL (
      VALUES
        ('OIL-FILTER-01', '8', 'A-01'),
        ('FUEL-FILTER-01', '6', 'A-02'),
        ('AIR-FILTER-01', '4', 'A-03'),
        ('BRAKE-PAD-F', '3', 'B-12'),
        ('BRAKE-PAD-R', '3', 'B-13'),
        ('BRAKE-SHOES-R', '2', 'B-14'),
        ('ALT-BELT-01', '5', 'C-04'),
        ('BATTERY-12V', '2', 'C-10'),
        ('HEADLAMP-L', '1', 'C-11'),
        ('TR-ORG-295', '4', 'T-01'),
        ('TR-DAG1-295', '2', 'T-02'),
        ('TR-DAG2-295', '1', 'T-03'),
        ('TR-DAG3-295', '1', 'T-04'),
        ('TR-REBUILD-295', '1', 'T-05'),
        ('OIL-15W40', '40', 'L-01'),
        ('OIL-GEAR-90', '20', 'L-02')
    ) AS levels(sku, reorder_level, bin_location)
    WHERE s.code IN ('CMB', 'KDY')
      AND p.sku = levels.sku
    ON CONFLICT (store_id, part_id) DO UPDATE SET
      reorder_level = EXCLUDED.reorder_level,
      bin_location = EXCLUDED.bin_location,
      active = true
  `);

  await client.query(
    `
    INSERT INTO store_part_settings (store_id, part_id, reorder_level, bin_location)
    SELECT s.id, p.id, '0'::numeric(14,3), 'SK-H'
    FROM jsonb_to_recordset($1::jsonb) AS v(sku text)
    JOIN stores s ON s.code = 'CMB'
    JOIN parts p ON p.sku = v.sku
    ON CONFLICT (store_id, part_id) DO UPDATE SET
      reorder_level = EXCLUDED.reorder_level,
      bin_location = EXCLUDED.bin_location,
      active = true
  `,
    [JSON.stringify(skhParts.map((item) => ({ sku: item.sku })))],
  );

  const demoSql = await readFile(path.join(seedDir, "mock-demo.sql"), "utf8");
  await client.query(demoSql);

  const existingSkhReceipt = await client.query(
    `
    SELECT 1 FROM stock_documents
    WHERE idempotency_key = 'seed:sin-cmb-sk-h-opening'
  `,
  );
  if ((existingSkhReceipt.rowCount ?? 0) === 0) {
    const doc = await client.query<{
      id: string;
      store_id: string;
      occurred_at: Date;
    }>(
      `
      INSERT INTO stock_documents (
        document_number, type, status, store_id, supplier_id, business_date,
        notes, idempotency_key, created_by, posted_by, posted_at, occurred_at
      )
      SELECT
        'SIN-CMB-2026-800010', 'STOCK_RECEIPT', 'POSTED', s.id, sup.id,
        '2026-08-18', 'Opening stock — China SK-H catalogue (Colombo)',
        'seed:sin-cmb-sk-h-opening', u.id, u.id,
        '2026-08-18 09:00+05:30', '2026-08-18 09:00+05:30'
      FROM stores s
      JOIN users u ON u.email = 'admin@dsgunasekara.local'
      JOIN suppliers sup ON sup.code = 'LOCAL-001'
      WHERE s.code = 'CMB'
      RETURNING id, store_id, occurred_at
    `,
    );
    const receipt = doc.rows[0];
    if (!receipt) throw new Error("Failed to create SK-H opening receipt");

    const stockLines = skhParts
      .filter((item) => item.onHand > 0)
      .map((item, index) => ({
        line_number: index + 1,
        sku: item.sku,
        qty: item.onHand,
      }));

    const insertedLines = await client.query(
      `
      INSERT INTO stock_document_lines (
        document_id, line_number, part_id, quantity, unit_cost,
        sku_snapshot, name_snapshot, unit_snapshot
      )
      SELECT $1, v.line_number, p.id, v.qty::numeric(14,3), NULL, p.sku, p.name, p.unit
      FROM jsonb_to_recordset($2::jsonb) AS v(
        line_number integer, sku text, qty numeric
      )
      JOIN parts p ON p.sku = v.sku
      RETURNING id
    `,
      [receipt.id, JSON.stringify(stockLines)],
    );
    if (insertedLines.rowCount !== stockLines.length) {
      throw new Error("SK-H opening receipt is missing one or more parts");
    }

    await client.query(
      `
      INSERT INTO stock_movements (
        document_id, document_line_id, store_id, part_id,
        quantity_delta, balance_after, occurred_at
      )
      SELECT
        l.document_id, l.id, $2, l.part_id, l.quantity,
        COALESCE(b.on_hand, 0) + l.quantity, $3
      FROM stock_document_lines l
      LEFT JOIN inventory_balances b
        ON b.store_id = $2 AND b.part_id = l.part_id
      WHERE l.document_id = $1
    `,
      [receipt.id, receipt.store_id, receipt.occurred_at],
    );

    await client.query(
      `
      INSERT INTO inventory_balances (store_id, part_id, on_hand, updated_at)
      SELECT store_id, part_id, balance_after, now()
      FROM stock_movements
      WHERE document_id = $1
      ON CONFLICT (store_id, part_id) DO UPDATE SET
        on_hand = EXCLUDED.on_hand,
        updated_at = now()
    `,
      [receipt.id],
    );
  }

  await client.query(
    `
    INSERT INTO audit_events (
      actor_id, event_type, entity_type, entity_id, store_id, metadata
    )
    SELECT
      u.id, 'INVENTORY_POSTED', 'stock_document', d.id::text, d.store_id,
      jsonb_build_object('documentNumber', d.document_number, 'type', d.type)
    FROM stock_documents d
    JOIN users u ON u.email = 'admin@dsgunasekara.local'
    WHERE d.idempotency_key = 'seed:sin-cmb-sk-h-opening'
      AND NOT EXISTS (
        SELECT 1 FROM audit_events a
        WHERE a.entity_type = 'stock_document'
          AND a.entity_id = d.id::text
          AND a.event_type = 'INVENTORY_POSTED'
      )
  `,
  );

  await client.query("COMMIT");
  const skhStockLines = skhParts.filter((item) => item.onHand > 0).length;
  console.log("Development data seeded.");
  console.log(
    `SK-H: ${skhParts.length} parts, ${skhStockLines} CMB opening-stock lines.`,
  );
  console.log(
    `New accounts use password: ${password} (existing admin passwords are left unchanged).`,
  );
  console.log("Admin: admin@dsgunasekara.local");
  console.log("Operator: operator@dsgunasekara.local (Colombo store)");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
