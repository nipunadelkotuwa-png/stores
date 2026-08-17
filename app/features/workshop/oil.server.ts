import { sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import { auditEvents, oilChanges } from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import {
  postStockInTransaction,
  prepareStockCommand,
} from "~/features/inventory/posting.server";
import { requirePartCategory } from "./category.server";
import { loadOpenJobCard } from "./job-cards.server";
import { recordOilChangeSchema } from "./schemas";

export async function recordOilChange(actor: Actor, input: unknown) {
  const command = recordOilChangeSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const card = await loadOpenJobCard(tx, command.jobCardId);
    await requireStoreAccess(actor, card.storeId);
    await requirePartCategory(tx, command.partId, "OIL");

    const posted = await postStockInTransaction(
      tx,
      actor,
      "BUS_ISSUE",
      prepareStockCommand("BUS_ISSUE", {
        storeId: card.storeId,
        busId: card.busId,
        jobCardId: card.id,
        businessDate: card.businessDate,
        notes: command.notes || "Oil change",
        idempotencyKey: command.idempotencyKey,
        lines: [{ partId: command.partId, quantity: command.litres }],
      }),
    );

    const [row] = await tx
      .insert(oilChanges)
      .values({
        jobCardId: card.id,
        busId: card.busId,
        partId: command.partId,
        stockDocumentId: posted.id,
        litres: command.litres,
        odometerKm: card.odometerKm,
        businessDate: card.businessDate,
        notes: command.notes || null,
        createdBy: actor.id,
      })
      .returning({ id: oilChanges.id });

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "OIL_CHANGE_RECORDED",
      entityType: "oil_change",
      entityId: row.id,
      storeId: card.storeId,
      metadata: {
        jobNumber: card.jobNumber,
        documentId: posted.id,
        litres: command.litres,
      },
    });

    return { id: row.id, documentId: posted.id };
  });
}
