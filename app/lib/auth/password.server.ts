import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(password: string) {
  if (password.length < 12)
    throw new Error("Password must contain at least 12 characters");
  return hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
