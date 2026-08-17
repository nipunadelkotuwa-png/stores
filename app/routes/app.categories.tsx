import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { partCategories } from "~/db/schema";
import { masterDataActionError } from "~/features/master-data/errors";
import { listPartCategories } from "~/features/master-data/queries.server";
import { requireAdmin, requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.categories";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return {
    categories: await listPartCategories(),
    canManage: user.role === "ADMIN",
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "toggle") {
    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "true";
    if (!z.string().uuid().safeParse(id).success) {
      return { error: "Invalid category." };
    }
    await db
      .update(partCategories)
      .set({ active: !active })
      .where(eq(partCategories.id, id));
    return { ok: true };
  }

  const parsed = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: "Code and name are required." };

  try {
    await db
      .insert(partCategories)
      .values({ ...parsed.data, code: parsed.data.code.toUpperCase() });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A category with that code already exists.",
        "Unable to add category.",
      ),
    };
  }
}

export default function CategoriesPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Categories</h1>
          <p className="muted">
            Manage part categories for inventory classification.
          </p>
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
          <h2>Category list</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  {loaderData.canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {loaderData.categories.map((category) => (
                  <tr key={category.id}>
                    <td className="mono">{category.code}</td>
                    <td>
                      <strong>{category.name}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${category.active ? "success" : ""}`}
                      >
                        {category.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {loaderData.canManage ? (
                      <td>
                        <Form method="post">
                          <CsrfField />
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={category.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={String(category.active)}
                          />
                          <button className="text-button" type="submit">
                            {category.active ? "Deactivate" : "Activate"}
                          </button>
                        </Form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {loaderData.canManage ? (
          <section className="panel form-panel" id="add-category-form">
            <h2>Add category</h2>
            <Form method="post" className="stack">
              <CsrfField />
              <input type="hidden" name="intent" value="create" />
              <label>
                Code
                <input name="code" required />
              </label>
              <label>
                Category name
                <input name="name" required />
              </label>
              <button
                className="button button-primary"
                disabled={navigation.state !== "idle"}
              >
                Add category
              </button>
            </Form>
          </section>
        ) : null}
      </div>
    </>
  );
}
