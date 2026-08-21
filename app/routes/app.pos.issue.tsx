import { redirect, useActionData, useSearchParams } from "react-router";

import { PosIssueCart } from "~/components/pos-issue-cart";
import {
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  submitIssueForApproval,
} from "~/features/inventory/posting.server";
import {
  getBalances,
  getRepetitiveIssueCounts,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import { UNUSUAL_ISSUE_THRESHOLD } from "~/features/workshop/constants";
import { listOpenJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.pos.issue";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const storeId = url.searchParams.get("store") || undefined;
  const [options, openJobCards, unusualCounts, balances] = await Promise.all([
    getTransactionOptions(actor),
    listOpenJobCards(actor, { storeId }),
    getRepetitiveIssueCounts(actor),
    getBalances(actor),
  ]);
  return {
    options,
    openJobCards,
    unusualCounts,
    balances,
    unusualThreshold: UNUSUAL_ISSUE_THRESHOLD,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const form = Object.fromEntries(formData);
  const loaded = loadStockLines(formData);
  if (!loaded.ok) {
    return { error: loaded.error, lineErrors: loaded.lineErrors };
  }
  try {
    const result = await submitIssueForApproval(actor, {
      ...form,
      lines: loaded.lines,
    });
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    const failure = stockLinesActionError(
      error,
      "Unable to submit issue",
      loaded.lines,
      inventoryActionError,
    );
    return { error: failure.error, lineErrors: failure.lineErrors };
  }
}

export default function PosIssuePage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const part = params.get("part") || undefined;
  const store = params.get("store") || undefined;

  return (
    <PosIssueCart
      options={loaderData.options}
      openJobCards={loaderData.openJobCards}
      balances={loaderData.balances}
      unusualCounts={loaderData.unusualCounts}
      unusualThreshold={loaderData.unusualThreshold}
      initialPartId={part}
      initialStoreId={store}
      actionData={actionData}
    />
  );
}
