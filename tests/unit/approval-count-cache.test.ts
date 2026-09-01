import { describe, expect, it } from "vitest";
import {
  invalidatePendingApprovalCountCache,
  readCachedApprovalCount,
  writeCachedApprovalCount,
} from "~/features/inventory/approval-count-cache.server";

describe("approval count cache", () => {
  it("stores and reads cached counts", () => {
    invalidatePendingApprovalCountCache();
    writeCachedApprovalCount("admin:all", 3);
    expect(readCachedApprovalCount("admin:all")).toBe(3);
  });

  it("clears cached counts", () => {
    writeCachedApprovalCount("admin:all", 5);
    invalidatePendingApprovalCountCache();
    expect(readCachedApprovalCount("admin:all")).toBeNull();
  });
});
