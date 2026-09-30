import { describe, expect, it } from "vitest";

import {
  can,
  defaultDashboardMode,
  roleLabel,
  type Permission,
  type Role,
} from "../../app/lib/auth/permissions";
import {
  assertNonAdminHasStore,
  NonAdminStoreError,
  wouldLeaveZeroAdmins,
} from "../../app/features/master-data/last-admin";

const ADMIN_ONLY: Permission[] = [
  "masterData.write",
  "dag.reject",
  "adjustments.create",
  "approvals.manage",
  "reversals.manage",
  "users.manage",
  "stores.manage",
  "reorder.manage",
  "audit.read",
];

describe("named role permissions", () => {
  it("treats ADMIN as a super-role without an explicit grant list", () => {
    expect(can("ADMIN", "users.manage")).toBe(true);
    expect(can("ADMIN", "dag.reject")).toBe(true);
    expect(can("ADMIN", "dashboard.read")).toBe(true);
  });

  it("keeps store keepers on stock and job-card read only", () => {
    expect(can("STORE_KEEPER", "stockIn.create")).toBe(true);
    expect(can("STORE_KEEPER", "jobCards.read")).toBe(true);
    expect(can("STORE_KEEPER", "jobCards.create")).toBe(false);
    expect(can("STORE_KEEPER", "jobCards.update")).toBe(false);
    expect(can("STORE_KEEPER", "tyres.manage")).toBe(false);
    expect(can("STORE_KEEPER", "dag.send")).toBe(false);
  });

  it("lets workshop send and receive DAG but not reject", () => {
    expect(can("WORKSHOP", "dag.send")).toBe(true);
    expect(can("WORKSHOP", "dag.receive")).toBe(true);
    expect(can("WORKSHOP", "dag.reject")).toBe(false);
    expect(can("WORKSHOP", "jobCards.create")).toBe(true);
    expect(can("WORKSHOP", "stockIn.create")).toBe(false);
  });

  it("limits viewers to generic reads", () => {
    expect(can("VIEWER", "balances.read")).toBe(true);
    expect(can("VIEWER", "reports.read")).toBe(true);
    expect(can("VIEWER", "stockIn.create")).toBe(false);
    expect(can("VIEWER", "issues.create")).toBe(false);
  });

  it("denies admin-only permissions to every non-admin role", () => {
    const roles: Role[] = ["OPERATOR", "STORE_KEEPER", "WORKSHOP", "VIEWER"];
    for (const role of roles) {
      for (const permission of ADMIN_ONLY) {
        expect(can(role, permission)).toBe(false);
      }
    }
  });

  it("labels roles and defaults dashboards", () => {
    expect(roleLabel("STORE_KEEPER")).toBe("Store keeper");
    expect(roleLabel("WORKSHOP")).toBe("Workshop");
    expect(roleLabel("VIEWER")).toBe("Viewer");
    expect(defaultDashboardMode("STORE_KEEPER")).toBe("pos");
    expect(defaultDashboardMode("VIEWER")).toBe("classic");
  });
});

describe("last-admin guard", () => {
  it("refuses demoting or disabling the last active admin", () => {
    expect(wouldLeaveZeroAdmins(1, true, { role: "VIEWER" })).toBe(true);
    expect(wouldLeaveZeroAdmins(1, true, { status: "DISABLED" })).toBe(true);
    expect(wouldLeaveZeroAdmins(2, true, { role: "VIEWER" })).toBe(false);
    expect(wouldLeaveZeroAdmins(1, false, { role: "VIEWER" })).toBe(false);
    expect(wouldLeaveZeroAdmins(1, true, { role: "ADMIN" })).toBe(false);
  });
});

describe("non-admin store assignment", () => {
  it("lets admins have zero assigned stores", () => {
    expect(() => assertNonAdminHasStore("ADMIN", [])).not.toThrow();
  });

  it("blocks demoting an admin with no store", () => {
    expect(() => assertNonAdminHasStore("VIEWER", [])).toThrow(
      NonAdminStoreError,
    );
    expect(() => assertNonAdminHasStore("VIEWER", [])).toThrow(
      /Assign a store before changing this user away from admin/,
    );
  });

  it("blocks removing the last store from a non-admin", () => {
    expect(() =>
      assertNonAdminHasStore("STORE_KEEPER", [{ storeId: "a" }], "a"),
    ).toThrow(/must keep at least one assigned store/);
    expect(() =>
      assertNonAdminHasStore(
        "STORE_KEEPER",
        [{ storeId: "a" }, { storeId: "b" }],
        "a",
      ),
    ).not.toThrow();
  });
});
