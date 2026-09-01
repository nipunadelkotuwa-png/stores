import { useNavigation, useOutletContext } from "react-router";

import { ClassicDashboard } from "~/components/classic-dashboard";
import { PosHub } from "~/components/pos-hub";
import { getDashboard } from "~/features/dashboard/queries.server";
import { getPosHubData } from "~/features/dashboard/pos-hub.server";
import { parsePeriodDays } from "~/features/dashboard/period";
import { dashboardShouldRevalidate } from "~/lib/app-layout-revalidation";
import { listOpenJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { readDashboardMode } from "~/lib/dashboard-mode.server";
import type { Route } from "./+types/app.dashboard";
import type { AppOutletContext } from "./app";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const mode = await readDashboardMode(request, actor.role);
  const canManage = actor.role === "ADMIN";

  if (mode === "pos") {
    const [pos, openJobCards] = await Promise.all([
      getPosHubData(actor),
      listOpenJobCards(actor),
    ]);
    return {
      mode,
      canManage,
      userName: actor.displayName,
      pos: {
        ...pos,
        openJobCardCount: openJobCards.length,
      },
      classic: null,
    };
  }

  return {
    mode,
    canManage,
    userName: actor.displayName,
    pos: null,
    classic: await getDashboard(actor, {
      periodDays: parsePeriodDays(new URL(request.url).searchParams.get("days")),
    }),
  };
}

export function shouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: {
  formAction?: string;
  defaultShouldRevalidate: boolean;
}) {
  return dashboardShouldRevalidate({ formAction, defaultShouldRevalidate });
}

function DashboardLoading({ mode }: { mode: "pos" | "classic" }) {
  return (
    <div className="empty-state">
      <strong>Loading {mode === "pos" ? "POS hub" : "classic dashboard"}…</strong>
      <p className="muted">Fetching the latest store data.</p>
    </div>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const { pendingApprovals } = useOutletContext<AppOutletContext>();
  const isSwitchingView =
    navigation.state !== "idle" &&
    navigation.formAction?.includes("/dashboard-mode");
  const pendingMode =
    navigation.formData?.get("mode") === "classic" ? "classic" : "pos";

  if (isSwitchingView) {
    return <DashboardLoading mode={pendingMode} />;
  }

  if (loaderData.mode === "pos" && loaderData.pos) {
    return (
      <PosHub
        userName={loaderData.userName}
        canManage={loaderData.canManage}
        data={{
          ...loaderData.pos,
          pendingApprovals,
        }}
      />
    );
  }

  if (!loaderData.classic) {
    return (
      <div className="empty-state">
        <strong>Dashboard unavailable</strong>
        <p>Try switching between POS and Classic view from the top bar.</p>
      </div>
    );
  }

  return (
    <ClassicDashboard
      userName={loaderData.userName}
      loaderData={{ ...loaderData.classic, canManage: loaderData.canManage }}
    />
  );
}
