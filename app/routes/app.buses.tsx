import { Form, Link, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { buses } from "~/db/schema";
import {
  busStatusBadgeClass,
  busStatusLabel,
} from "~/features/master-data/bus-lifecycle";
import {
  activateBus,
  deactivateBus,
  markBusSold,
  restoreSoldBus,
} from "~/features/master-data/buses.server";
import { masterDataActionError } from "~/features/master-data/errors";
import { listBuses } from "~/features/master-data/queries.server";
import {
  rethrowAuthorizationError,
  requirePermission,
} from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.buses";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requirePermission(request, "masterData.read");
  return {
    buses: await listBuses(),
    canManage: can(user.role, "masterData.write"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "masterData.write");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "create");
  const id = String(formData.get("id") ?? "");

  try {
    if (intent === "deactivate") {
      await deactivateBus(actor, id);
      return { ok: true };
    }
    if (intent === "activate") {
      await activateBus(actor, id);
      return { ok: true };
    }
    if (intent === "mark-sold") {
      await markBusSold(actor, id, String(formData.get("soldReason") ?? ""));
      return { ok: true };
    }
    if (intent === "restore") {
      await restoreSoldBus(actor, id, formData.get("confirm") === "true");
      return { ok: true };
    }
  } catch (error) {
    rethrowAuthorizationError(error);
    return {
      error: masterDataActionError(
        error,
        "Invalid bus.",
        "Unable to update bus.",
      ),
    };
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
            Deactivate a bus that is temporarily out of service. Mark as sold
            when it leaves the fleet so it cannot be used on new job cards.
          </p>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      <div className={loaderData.canManage ? "two-column" : undefined}>
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fleet no.</th>
                  <th>Registration</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  {loaderData.canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {loaderData.buses.map((bus) => (
                  <tr key={bus.id}>
                    <td className="mono">
                      <Link to={`/buses/${bus.id}`}>{bus.fleetNumber}</Link>
                    </td>
                    <td>{bus.registrationNumber ?? "—"}</td>
                    <td>
                      {[bus.make, bus.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>
                      <span className={busStatusBadgeClass(bus.status)}>
                        {busStatusLabel(bus.status)}
                      </span>
                    </td>
                    {loaderData.canManage ? (
                      <td>
                        <div className="table-actions">
                          {bus.status === "SOLD" ? (
                            <Form method="post" className="table-action-form">
                              <CsrfField />
                              <input
                                type="hidden"
                                name="intent"
                                value="restore"
                              />
                              <input type="hidden" name="id" value={bus.id} />
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  name="confirm"
                                  value="true"
                                  required
                                />
                                Confirm restore
                              </label>
                              <button className="text-button" type="submit">
                                Restore to fleet
                              </button>
                            </Form>
                          ) : (
                            <>
                              <Form method="post">
                                <CsrfField />
                                <input
                                  type="hidden"
                                  name="intent"
                                  value={
                                    bus.status === "ACTIVE"
                                      ? "deactivate"
                                      : "activate"
                                  }
                                />
                                <input type="hidden" name="id" value={bus.id} />
                                <button className="text-button" type="submit">
                                  {bus.status === "ACTIVE"
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                              </Form>
                              <Form method="post" className="table-action-form">
                                <CsrfField />
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="mark-sold"
                                />
                                <input type="hidden" name="id" value={bus.id} />
                                <input
                                  name="soldReason"
                                  placeholder="Sale reason (optional)"
                                  aria-label={`Sale reason for ${bus.fleetNumber}`}
                                />
                                <button className="text-button" type="submit">
                                  Mark as Sold
                                </button>
                              </Form>
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {loaderData.canManage ? (
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
        ) : null}
      </div>
    </>
  );
}
