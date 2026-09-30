import { useEffect, useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { parts } from "~/db/schema";
import { normalizeBarcode } from "~/features/master-data/barcode";
import { masterDataActionError } from "~/features/master-data/errors";
import {
  listParts,
  listPartCategories,
} from "~/features/master-data/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import { requireValidCsrf } from "~/lib/csrf.server";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.parts";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requirePermission(request, "masterData.read");
  return {
    parts: await listParts(),
    categories: await listPartCategories(),
    canManage: can(user.role, "masterData.write"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requirePermission(request, "masterData.write");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "toggle") {
    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "true";
    if (!z.string().uuid().safeParse(id).success) {
      return { error: "Invalid part." };
    }
    await db.update(parts).set({ active: !active }).where(eq(parts.id, id));
    return { ok: true };
  }

  const partFields = z.object({
    sku: z.string().min(1),
    name: z.string().min(1),
    unit: z.string().min(1),
    brand: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().optional(),
    ),
    barcode: z.preprocess(
      (value) => normalizeBarcode(typeof value === "string" ? value : null),
      z.string().nullable().optional(),
    ),
    categoryId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().uuid().optional(),
    ),
  });

  if (intent === "update") {
    const parsed = partFields
      .extend({ id: z.string().uuid() })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: "SKU, name, and unit are required." };
    try {
      await db
        .update(parts)
        .set({
          sku: parsed.data.sku.toUpperCase(),
          name: parsed.data.name,
          unit: parsed.data.unit,
          brand: parsed.data.brand ?? null,
          barcode: normalizeBarcode(parsed.data.barcode),
          categoryId: parsed.data.categoryId ?? null,
        })
        .where(eq(parts.id, parsed.data.id));
      return { ok: true };
    } catch (error) {
      return {
        error: masterDataActionError(
          error,
          "A part with that SKU already exists.",
          "Unable to update part.",
        ),
      };
    }
  }

  const parsed = partFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "SKU, name, and unit are required." };
  try {
    await db.insert(parts).values({
      ...parsed.data,
      sku: parsed.data.sku.toUpperCase(),
      barcode: normalizeBarcode(parsed.data.barcode),
    });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A part with that SKU already exists.",
        "Unable to add part.",
      ),
    };
  }
}

export default function PartsPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q")?.trim() ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = loaderData.parts.find((part) => part.id === editingId);

  useEffect(() => {
    const query = searchParams.get("q")?.trim() ?? "";
    setSearchQuery(query);
  }, [searchParams]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let sequence = "";

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys and other special keys
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt") return;

      if (e.key === "Enter" && sequence.length > 3) {
        setScannedBarcode(sequence);
        setSearchQuery(sequence);
        sequence = "";
      } else if (e.key.length === 1) {
        sequence += e.key;
        clearTimeout(timeout);
        // Barcode scanners usually type very fast
        timeout = setTimeout(() => {
          sequence = "";
        }, 50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeout);
    };
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Spare parts</h1>
          <p className="muted">
            Part catalogue used across receipts, issues, purchases, and reports.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/parts/print-labels" className="button button-secondary">
            Print Labels
          </Link>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="muted">Saved.</p>
      ) : null}
      <div className={loaderData.canManage ? "two-column" : undefined}>
        <section className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <h2>Part catalogue</h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                style={{
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              >
                <option value="">All categories</option>
                {loaderData.categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Search name, SKU, or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Part</th>
                  <th>Barcode</th>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Status</th>
                  {loaderData.canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {loaderData.parts
                  .filter((part) => {
                    if (
                      categoryFilter &&
                      (part.category ?? "Uncategorized") !== categoryFilter
                    ) {
                      return false;
                    }
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      part.sku.toLowerCase().includes(q) ||
                      part.name.toLowerCase().includes(q) ||
                      (part.barcode &&
                        part.barcode.toLowerCase().includes(q)) ||
                      (part.brand && part.brand.toLowerCase().includes(q))
                    );
                  })
                  .map((part) => (
                    <tr key={part.id}>
                      <td className="mono">{part.sku}</td>
                      <td>
                        <strong>{part.name}</strong>
                        <small>{part.category ?? "Uncategorized"}</small>
                      </td>
                      <td className="mono">{part.barcode ?? "—"}</td>
                      <td>{part.unit}</td>
                      <td>{part.brand ?? "—"}</td>
                      <td>
                        <span
                          className={`badge ${part.active ? "success" : ""}`}
                        >
                          {part.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {loaderData.canManage ? (
                        <td>
                          <Form method="post">
                            <CsrfField />
                            <input type="hidden" name="intent" value="toggle" />
                            <input type="hidden" name="id" value={part.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={String(part.active)}
                            />
                            <button className="text-button" type="submit">
                              {part.active ? "Deactivate" : "Activate"}
                            </button>
                          </Form>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => {
                              setEditingId(part.id);
                              setScannedBarcode(part.barcode ?? "");
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        {loaderData.canManage ? (
          <section className="panel form-panel" id="add-part-form">
            <h2>{editing ? "Edit spare part" : "Add spare part"}</h2>
            <Form
              method="post"
              className="stack"
              key={editing?.id ?? "create"}
              onSubmit={() => setEditingId(null)}
            >
              <CsrfField />
              <input
                type="hidden"
                name="intent"
                value={editing ? "update" : "create"}
              />
              {editing ? (
                <input type="hidden" name="id" value={editing.id} />
              ) : null}
              <label>
                SKU
                <input name="sku" required defaultValue={editing?.sku ?? ""} />
              </label>
              <label>
                Part name
                <input
                  name="name"
                  required
                  defaultValue={editing?.name ?? ""}
                />
              </label>
              <label>
                Unit
                <input
                  name="unit"
                  defaultValue={editing?.unit ?? "EA"}
                  required
                />
              </label>
              <label>
                Brand
                <input name="brand" defaultValue={editing?.brand ?? ""} />
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  defaultValue={editing?.categoryId ?? ""}
                >
                  <option value="">-- Uncategorized --</option>
                  {loaderData.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Barcode (optional)
                <input
                  name="barcode"
                  value={scannedBarcode}
                  onChange={(event) => setScannedBarcode(event.target.value)}
                  placeholder="Scan or type…"
                />
              </label>
              <button
                className="button button-primary"
                disabled={navigation.state !== "idle"}
              >
                {editing ? "Save part" : "Add part"}
              </button>
              {editing ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setScannedBarcode("");
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </Form>
          </section>
        ) : null}
      </div>
    </>
  );
}
