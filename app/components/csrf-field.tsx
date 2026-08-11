import { useRouteLoaderData } from "react-router";

type AppLoaderData = { csrf: string };

export function CsrfField() {
  const data = useRouteLoaderData("routes/app") as AppLoaderData | undefined;
  if (!data?.csrf) {
    throw new Error("CSRF token unavailable outside authenticated app layout");
  }
  return <input type="hidden" name="csrf" value={data.csrf} />;
}
