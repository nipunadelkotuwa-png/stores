import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { stockDocuments, tyreEvents, tyres } from "~/db/schema";
import type { Transaction } from "~/features/inventory/posting.server";
import { parseWorkshopNotes } from "./pending-notes";
import type { TyreLifecycleEvent } from "./tyre-lifecycle";

export async function lockTyre(tx: Transaction, tyreId: string) {
  await tx.execute(
    sql`SELECT 1 FROM tyres WHERE id = ${tyreId}::uuid FOR UPDATE`,
  );
  const [tyre] = await tx
    .select()
    .from(tyres)
    .where(eq(tyres.id, tyreId))
    .limit(1);
  return tyre;
}

export async function loadTyreLifecycleEvents(
  tx: Transaction,
  tyreId: string,
): Promise<TyreLifecycleEvent[]> {
  return tx
    .select({
      tyreId: tyreEvents.tyreId,
      type: tyreEvents.type,
      sequence: tyreEvents.sequence,
    })
    .from(tyreEvents)
    .where(eq(tyreEvents.tyreId, tyreId))
    .orderBy(asc(tyreEvents.sequence));
}

export async function reservedTyreIds(tx: Pick<Transaction, "select">) {
  const pending = await tx
    .select({ notes: stockDocuments.notes })
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.type, "BUS_ISSUE"),
        eq(stockDocuments.status, "PENDING_APPROVAL"),
      ),
    );
  const ids = new Set<string>();
  for (const row of pending) {
    const payload = parseWorkshopNotes(row.notes);
    if (payload?.kind === "TYRE_FIT") ids.add(payload.tyreId);
  }
  return ids;
}
