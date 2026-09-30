import { sql } from "drizzle-orm";

import { db } from "~/db/client.server";
import { auditEvents, oilChanges } from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import {
  assertPermission,
  requireStoreAccess,
} from "~/lib/auth/authorization.server";
import {
  notifyIssueSubmitted,
  submitIssueForApprovalInTransaction,
} from "~/features/inventory/posting.server";
import { requirePartCategory } from "./category.server";
import { loadOpenJobCard } from "./job-cards.server";
import { encodeWorkshopNotes } from "./pending-notes";
import { recordOilChangeSchema } from "./schemas";

export async function recordOilChange(actor: Actor, input: unknown) {
  assertPermission(actor, "jobCards.update");
  const command = recordOilChangeSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const card = await loadOpenJobCard(tx, command.jobCardId);
    await requireStoreAccess(actor, card.storeId);
    await requirePartCategory(tx, command.partId, "OIL");

    const pending = await submitIssueForApprovalInTransaction(tx, actor, {
      storeId: card.storeId,
      busId: card.busId,
      jobCardId: card.id,
      businessDate: card.businessDate,
      notes: encodeWorkshopNotes(
        { kind: "OIL" },
        command.notes || "Oil change",
      ),
      idempotencyKey: command.idempotencyKey,
      lines: [{ partId: command.partId, quantity: command.litres }],
    });

    if (pending.created) {
      const [row] = await tx
        .insert(oilChanges)
        .values({
          jobCardId: card.id,
          busId: card.busId,
          partId: command.partId,
          stockDocumentId: pending.id,
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
          documentId: pending.id,
          litres: command.litres,
          pending: true,
        },
      });
    }

    return pending;
  });

  notifyIssueSubmitted(result);
  return { id: result.id, documentId: result.id, number: result.number };
}
