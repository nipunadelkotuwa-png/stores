import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("login", "routes/auth.login.tsx"),
  route("logout", "routes/auth.logout.ts"),
  route("change-password", "routes/auth.change-password.tsx"),
  route("health/live", "routes/health.live.ts"),
  route("health/ready", "routes/health.ready.ts"),
  layout("routes/app.tsx", [
    index("routes/app.dashboard.tsx"),
    route("balances", "routes/app.balances.tsx"),
    route("stock-in/new", "routes/app.stock-in.new.tsx"),
    route("issues/new", "routes/app.issues.new.tsx"),
    route("purchases", "routes/app.purchases._index.tsx"),
    route("purchases/new", "routes/app.purchases.new.tsx"),
    route("alerts/low-stock", "routes/app.alerts.low-stock.tsx"),
    route("parts", "routes/app.parts.tsx"),
    route("buses", "routes/app.buses.tsx"),
    route("suppliers", "routes/app.suppliers.tsx"),
    route("reports/movements", "routes/app.reports.movements.tsx"),
    route("reports/bus-usage", "routes/app.reports.bus-usage.tsx"),
    layout("routes/admin.tsx", [
      route("admin/users", "routes/admin.users.tsx"),
      route("admin/stores", "routes/admin.stores.tsx"),
      route("admin/reorder", "routes/admin.reorder.tsx"),
      route("admin/corrections", "routes/admin.corrections.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
