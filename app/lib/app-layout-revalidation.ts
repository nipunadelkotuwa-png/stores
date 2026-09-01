type AppLayoutShouldRevalidateArgs = {
  formAction?: string;
  defaultShouldRevalidate: boolean;
  currentUrl?: URL;
  nextUrl?: URL;
};

const LAYOUT_REVALIDATE_ACTIONS = ["/dashboard-mode", "/approvals"];

const LAYOUT_SKIP_ACTIONS = [
  "/notifications",
  "/pos/issue",
  "/issues/new",
  "/stock-in/new",
  "/transfers/new",
  "/purchases/new",
];

export function appLayoutShouldRevalidate({
  formAction,
  defaultShouldRevalidate,
  currentUrl,
  nextUrl,
}: AppLayoutShouldRevalidateArgs) {
  if (formAction) {
    if (LAYOUT_REVALIDATE_ACTIONS.some((path) => formAction.includes(path))) {
      return true;
    }
    if (LAYOUT_SKIP_ACTIONS.some((path) => formAction.includes(path))) {
      return false;
    }
    if (formAction.includes("approve") || formAction.includes("reject")) {
      return true;
    }
    return false;
  }

  if (
    currentUrl &&
    nextUrl &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search
  ) {
    return false;
  }

  return defaultShouldRevalidate;
}

export function dashboardShouldRevalidate({
  formAction,
  defaultShouldRevalidate,
}: {
  formAction?: string;
  defaultShouldRevalidate: boolean;
}) {
  if (formAction?.includes("/dashboard-mode")) return true;
  return defaultShouldRevalidate;
}
