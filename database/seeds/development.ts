import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { hashPassword } from "../../app/lib/auth/password.server";

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
      ('OIL', 'Oil')
    ON CONFLICT (code) DO NOTHING
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

  const demoSql = await readFile(path.join(seedDir, "mock-demo.sql"), "utf8");
  await client.query(demoSql);

  await client.query("COMMIT");
  console.log("Development data seeded.");
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
