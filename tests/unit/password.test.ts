import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "../../app/lib/auth/password.server";

describe("password service", () => {
  it("hashes and verifies a password", async () => {
    const password = "a-long-test-password";
    const hashed = await hashPassword(password);
    expect(hashed).not.toBe(password);
    expect(await verifyPassword(hashed, password)).toBe(true);
    expect(await verifyPassword(hashed, "wrong-password")).toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/12 characters/);
  });
});
