import { and, eq, inArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";

import { db } from "~/db/client.server";
import {
  auditEvents,
  partCategories,
  parts,
  stockDocuments,
  tyreEvents,
  tyres,
} from "~/db/schema";
import type { Actor } from "~/lib/auth/authorization.server";
import { requireStoreAccess } from "~/lib/auth/authorization.server";
import {
  postStockInTransaction,
  prepareStockCommand,
} from "~/features/inventory/posting.server";
import { WorkshopError } from "~/features/workshop/errors";

function uniqueIds(values: string[] | undefined) {
  return [...new Set(values ?? [])];
}

export async function sendStoreTransfer(actor: Actor, input: unknown) {
  const command = prepareStockCommand("TRANSFER_OUT", input);
  await requireStoreAccess(actor, command.storeId);

  const tyreIds = uniqueIds(command.tyreIds);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    const partRows = await tx
      .select({
        id: parts.id,
        categoryCode: partCategories.code,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.categoryId, partCategories.id))
      .where(
        inArray(
          parts.id,
          command.lines.map((line) => line.partId),
        ),
      );
    const categoryByPart = new Map(
      partRows.map((row) => [row.id, row.categoryCode]),
    );

    const tyreParts = command.lines.filter(
      (line) => categoryByPart.get(line.partId) === "TYRE",
    );
    if (tyreParts.length > 0) {
      const expected = tyreParts.reduce(
        (sum, line) => sum.plus(line.quantity),
        new Decimal(0),
      );
      if (tyreIds.length !== expected.toNumber()) {
        throw new WorkshopError(
          "Select exactly as many in-store tyre serials as the transfer quantity",
        );
      }
      const serials = await tx
        .select()
        .from(tyres)
        .where(inArray(tyres.id, tyreIds));
      if (serials.length !== tyreIds.length) {
        throw new WorkshopError("One or more tyre serials were not found");
      }
      const remaining = new Map(
        tyreParts.map((line) => [line.partId, new Decimal(line.quantity)]),
      );
      for (const serial of serials) {
        if (
          serial.status !== "IN_STORE" ||
          serial.storeId !== command.storeId
        ) {
          throw new WorkshopError(
            `Tyre ${serial.serialNumber} must be in store at the source location`,
          );
        }
        const left = remaining.get(serial.partId);
        if (!left || left.lte(0)) {
          throw new WorkshopError(
            `Tyre ${serial.serialNumber} does not match the transferred SKUs`,
          );
        }
        remaining.set(serial.partId, left.minus(1));
      }
    } else if (tyreIds.length > 0) {
      throw new WorkshopError(
        "Tyre serials can only be transferred with TYRE SKUs",
      );
    }

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TRANSFER_OUT",
      command,
    );

    if (tyreIds.length > 0) {
      await tx
        .update(tyres)
        .set({
          status: "IN_TRANSIT",
          currentBusId: null,
          currentPosition: null,
        })
        .where(inArray(tyres.id, tyreIds));
      await tx.insert(tyreEvents).values(
        tyreIds.map((tyreId) => ({
          tyreId,
          type: "TRANSFER_OUT" as const,
          stockDocumentId: posted.id,
          storeId: command.storeId,
          notes: command.notes || null,
          createdBy: actor.id,
        })),
      );
    }

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TRANSFER_SENT",
      entityType: "stock_document",
      entityId: posted.id,
      storeId: command.storeId,
      metadata: {
        documentNumber: posted.number,
        destinationStoreId: command.destinationStoreId,
      },
    });
    return posted;
  });
}

export async function receiveStoreTransfer(
  actor: Actor,
  input: { documentId: string; businessDate: string; idempotencyKey: string },
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const [outgoing] = await tx
      .select()
      .from(stockDocuments)
      .where(eq(stockDocuments.id, input.documentId))
      .limit(1);
    if (
      !outgoing ||
      outgoing.type !== "TRANSFER_OUT" ||
      outgoing.status !== "POSTED" ||
      !outgoing.destinationStoreId
    ) {
      throw new WorkshopError("Transfer-out document not found");
    }
    await requireStoreAccess(actor, outgoing.destinationStoreId);

    const [already] = await tx
      .select({ id: stockDocuments.id })
      .from(stockDocuments)
      .where(eq(stockDocuments.linkedDocumentId, outgoing.id))
      .limit(1);
    if (already) {
      throw new WorkshopError("This transfer has already been received");
    }

    const { stockDocumentLines } = await import("~/db/schema");
    const lines = await tx
      .select()
      .from(stockDocumentLines)
      .where(eq(stockDocumentLines.documentId, outgoing.id));

    const posted = await postStockInTransaction(
      tx,
      actor,
      "TRANSFER_IN",
      prepareStockCommand("TRANSFER_IN", {
        storeId: outgoing.destinationStoreId,
        linkedDocumentId: outgoing.id,
        businessDate: input.businessDate,
        notes: `Receives ${outgoing.documentNumber}`,
        idempotencyKey: input.idempotencyKey,
        lines: lines.map((line) => ({
          partId: line.partId,
          quantity: line.quantity,
        })),
      }),
    );

    const serialEvents = await tx
      .select({ tyreId: tyreEvents.tyreId })
      .from(tyreEvents)
      .where(
        and(
          eq(tyreEvents.stockDocumentId, outgoing.id),
          eq(tyreEvents.type, "TRANSFER_OUT"),
        ),
      );
    const serialIds = serialEvents.map((row) => row.tyreId);
    if (serialIds.length > 0) {
      await tx
        .update(tyres)
        .set({
          status: "IN_STORE",
          storeId: outgoing.destinationStoreId,
        })
        .where(inArray(tyres.id, serialIds));
      await tx.insert(tyreEvents).values(
        serialIds.map((tyreId) => ({
          tyreId,
          type: "TRANSFER_IN" as const,
          stockDocumentId: posted.id,
          storeId: outgoing.destinationStoreId,
          createdBy: actor.id,
        })),
      );
    }

    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "TRANSFER_RECEIVED",
      entityType: "stock_document",
      entityId: posted.id,
      storeId: outgoing.destinationStoreId,
      metadata: {
        documentNumber: posted.number,
        linkedDocumentId: outgoing.id,
      },
    });
    return posted;
  });
}
