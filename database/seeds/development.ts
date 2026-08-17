import { Client } from "pg";

import { hashPassword } from "../../app/lib/auth/password.server";

if (process.env.NODE_ENV === "production")
  throw new Error("Development seed cannot run in production");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const password = process.env.DEV_ADMIN_PASSWORD ?? "ChangeMe123!";
const passwordHash = await hashPassword(password);
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO stores (code, name, address)
    VALUES ('CMB', 'Colombo Central Store', 'Colombo'), ('KDY', 'Kandy Store', 'Kandy')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(
    `
    INSERT INTO users (email, display_name, password_hash, role, must_change_password)
    VALUES ('admin@dsgunasekara.local', 'System Administrator', $1, 'ADMIN', true)
    ON CONFLICT (email) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      role = 'ADMIN',
      must_change_password = true,
      status = 'ACTIVE'
  `,
    [passwordHash],
  );
  await client.query(`
    INSERT INTO part_categories (code, name)
    VALUES
      ('ENGINE', 'Engine'),
      ('BRAKE', 'Brakes'),
      ('ELECTRICAL', 'Electrical'),
      ('TYRE', 'Tyres'),
      ('OIL', 'Oil')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(`
    INSERT INTO suppliers (code, name)
    VALUES ('LOCAL-001', 'Local Supplier')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(`
    INSERT INTO buses (fleet_number, registration_number, make, model)
    VALUES ('BUS-001', 'WP-NA-0001', 'Ashok Leyland', 'Viking')
    ON CONFLICT (fleet_number) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'OIL-FILTER-01', 'Engine oil filter', 'EA', 'FleetGuard', id
    FROM part_categories WHERE code = 'ENGINE'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'BRAKE-PAD-F', 'Front brake pad set', 'SET', 'WVA', id
    FROM part_categories WHERE code = 'BRAKE'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'ALT-BELT-01', 'Alternator belt', 'EA', 'Gates', id
    FROM part_categories WHERE code = 'ELECTRICAL'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'TR-ORG-295', '295/80R22.5 original tyre', 'EA', 'Ceat', id
    FROM part_categories WHERE code = 'TYRE'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'TR-DAG1-295', '295/80R22.5 DAG1 retread', 'EA', 'Ceat', id
    FROM part_categories WHERE code = 'TYRE'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO parts (sku, name, unit, brand, category_id)
    SELECT 'OIL-15W40', 'Engine oil 15W-40', 'L', 'FleetGuard', id
    FROM part_categories WHERE code = 'OIL'
    ON CONFLICT (sku) DO NOTHING
  `);
  await client.query(`
    INSERT INTO store_part_settings (store_id, part_id, reorder_level, bin_location)
    SELECT s.id, p.id, levels.reorder_level::numeric(14,3), levels.bin_location
    FROM stores s
    CROSS JOIN parts p
    CROSS JOIN LATERAL (
      VALUES
        ('OIL-FILTER-01', '5', 'A-01'),
        ('BRAKE-PAD-F', '2', 'B-12'),
        ('ALT-BELT-01', '3', 'C-04'),
        ('TR-ORG-295', '4', 'T-01'),
        ('TR-DAG1-295', '2', 'T-02'),
        ('OIL-15W40', '40', 'L-01')
    ) AS levels(sku, reorder_level, bin_location)
    WHERE s.code IN ('CMB', 'KDY')
      AND p.sku = levels.sku
    ON CONFLICT (store_id, part_id) DO UPDATE SET
      reorder_level = EXCLUDED.reorder_level,
      bin_location = EXCLUDED.bin_location,
      active = true
  `);
  await client.query("COMMIT");
  console.log(
    `Development data seeded. Admin: admin@dsgunasekara.local / ${password}`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
