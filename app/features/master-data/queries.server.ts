import { asc, eq } from "drizzle-orm";
import { db } from "~/db/client.server";
import {
  buses,
  partCategories,
  parts,
  stores,
  suppliers,
  users,
  userStoreAssignments,
} from "~/db/schema";

export const listParts = () =>
  db
    .select({
      id: parts.id,
      sku: parts.sku,
      name: parts.name,
      barcode: parts.barcode,
      unit: parts.unit,
      brand: parts.brand,
      active: parts.active,
      category: partCategories.name,
      categoryCode: partCategories.code,
    })
    .from(parts)
    .leftJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .orderBy(asc(parts.sku));
export const listBuses = () =>
  db.select().from(buses).orderBy(asc(buses.fleetNumber));
export const listSuppliers = () =>
  db.select().from(suppliers).orderBy(asc(suppliers.name));
export const listStores = () =>
  db.select().from(stores).orderBy(asc(stores.code));
export const listUsers = () =>
  db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .orderBy(asc(users.displayName));
export const listUserAssignments = () =>
  db
    .select({
      userId: userStoreAssignments.userId,
      storeId: userStoreAssignments.storeId,
      storeName: stores.name,
    })
    .from(userStoreAssignments)
    .innerJoin(stores, eq(userStoreAssignments.storeId, stores.id));

export const listPartCategories = () =>
  db.select().from(partCategories).orderBy(asc(partCategories.name));
