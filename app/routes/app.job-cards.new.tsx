import { Form, redirect, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { workshopActionError } from "~/features/workshop/errors";
import { openJobCard } from "~/features/workshop/job-cards.server";
import { getJobCardFormOptions } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.job-cards.new";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  return {
    ...(await getJobCardFormOptions(actor)),
    initialStoreId: url.searchParams.get("store") || "",
    initialBusId: url.searchParams.get("bus") || "",
    partId: url.searchParams.get("part") || "",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const partId = String(formData.get("partId") || "");
  try {
    const card = await openJobCard(actor, Object.fromEntries(formData));
    const suffix = partId ? `?part=${encodeURIComponent(partId)}` : "";
    throw redirect(`/job-cards/${card.id}${suffix}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: workshopActionError(error, "Unable to open job card") };
  }
}

export default function NewJobCardPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>Open job card</h1>
          <p className="muted">
            One open card per bus. Stock issues and returns must use this card.
          </p>
        </div>
      </div>
      <Form
        method="post"
        className="panel form-stack"
        style={{ maxWidth: 560 }}
      >
        <CsrfField />
        {loaderData.partId ? (
          <input type="hidden" name="partId" value={loaderData.partId} />
        ) : null}
        <label>
          Store
          {loaderData.stores.length === 0 ? (
            <p className="form-error">You are not assigned to any stores.</p>
          ) : (
            <select
              name="storeId"
              required
              defaultValue={loaderData.initialStoreId}
            >
              <option value="">Select store</option>
              {loaderData.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} — {store.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label>
          Bus
          <select name="busId" required defaultValue={loaderData.initialBusId}>
            <option value="">Select bus</option>
            {loaderData.buses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                {bus.fleetNumber}
                {bus.registrationNumber ? ` — ${bus.registrationNumber}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Business date
          <input
            type="date"
            name="businessDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label>
          Odometer (km)
          <input type="number" name="odometerKm" min="0" step="0.1" />
        </label>
        <label>
          Mechanic
          <input name="mechanicName" />
        </label>
        <label>
          Complaint / defect
          <textarea name="complaint" rows={4} required minLength={3} />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        {actionData?.error ? (
          <p className="form-error">{actionData.error}</p>
        ) : null}
        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={
              navigation.state !== "idle" || loaderData.stores.length === 0
            }
          >
            {navigation.state === "submitting" ? "Opening…" : "Open job card"}
          </button>
        </div>
      </Form>
    </>
  );
}
