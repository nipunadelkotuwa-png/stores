/** Simple in-memory login attempt limiter (per process). */

type AttemptBucket = {
  failures: number;
  lockedUntil: number;
};

const buckets = new Map<string, AttemptBucket>();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

function keyFor(ip: string, email: string) {
  return `${ip}::${email.toLowerCase()}`;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function assertLoginAllowed(ip: string, email: string): string | null {
  const key = keyFor(ip, email);
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.lockedUntil > Date.now()) {
    const mins = Math.ceil((bucket.lockedUntil - Date.now()) / 60_000);
    return `Too many failed attempts. Try again in ${mins} minute(s).`;
  }
  return null;
}

export function recordLoginFailure(ip: string, email: string) {
  const key = keyFor(ip, email);
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.lockedUntil < now - WINDOW_MS) {
    buckets.set(key, { failures: 1, lockedUntil: 0 });
    return;
  }
  const failures = existing.failures + 1;
  buckets.set(key, {
    failures,
    lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : 0,
  });
}

export function clearLoginFailures(ip: string, email: string) {
  buckets.delete(keyFor(ip, email));
}
