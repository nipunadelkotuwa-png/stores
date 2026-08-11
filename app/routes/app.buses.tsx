import { eq } from "drizzle-orm";
import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { buses } from "~/db/schema";
import { masterDataActionError } from "~/features/master-data/errors";
import { listBuses } from "~/features/master-data/queries.server";
import { requireAdmin, requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.buses";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return { buses: await listBuses() };
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
      return { error: "Invalid bus." };
    }
    await db
      .update(buses)
      .set({
        active: !active,
        status: active ? "INACTIVE" : "ACTIVE",
      })
      .where(eq(buses.id, id));
    return { ok: true };
  }

  const parsed = z
    .object({
      fleetNumber: z.string().min(1),
      registrationNumber: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Fleet number is required." };
  try {
    await db.insert(buses).values({
      ...parsed.data,
      registrationNumber: parsed.data.registrationNumber || null,
    });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A bus with that fleet or registration already exists.",
        "Unable to add bus.",
      ),
    };
  }
}

export default function BusesPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet</p>
          <h1>Buses</h1>
          <p className="muted">
            Every stock issue is attributable to a fleet vehicle.
          </p>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fleet no.</th>
                  <th>Registration</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loaderData.buses.map((bus) => (
                  <tr key={bus.id}>
                    <td className="mono">{bus.fleetNumber}</td>
                    <td>{bus.registrationNumber ?? "—"}</td>
                    <td>
                      {[bus.make, bus.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>
                      <span className={`badge ${bus.active ? "success" : ""}`}>
                        {bus.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Form method="post">
                        <CsrfField />
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={bus.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(bus.active)}
                        />
                        <button className="text-button" type="submit">
                          {bus.active ? "Deactivate" : "Activate"}
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel form-panel">
          <h2>Add bus</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="create" />
            <label>
              Fleet number
              <input name="fleetNumber" required />
            </label>
            <label>
              Registration
              <input name="registrationNumber" />
            </label>
            <label>
              Make
              <input name="make" />
            </label>
            <label>
              Model
              <input name="model" />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Add bus
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}
