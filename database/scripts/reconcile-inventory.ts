import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query(`
    SELECT b.store_id, b.part_id, b.on_hand,
           COALESCE(SUM(m.quantity_delta), 0)::numeric(14,3) AS ledger_balance
    FROM inventory_balances b
    LEFT JOIN stock_movements m
      ON m.store_id = b.store_id AND m.part_id = b.part_id
    GROUP BY b.store_id, b.part_id, b.on_hand
    HAVING b.on_hand <> COALESCE(SUM(m.quantity_delta), 0)::numeric(14,3)
  `);
  if (result.rowCount && result.rowCount > 0) {
    console.error(result.rows);
    process.exit(1);
  }
  console.log("Inventory balances reconcile with the movement ledger.");
} finally {
  await client.end();
}
