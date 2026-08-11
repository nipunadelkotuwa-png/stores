import { pool } from "~/db/client.server";
export async function loader() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
