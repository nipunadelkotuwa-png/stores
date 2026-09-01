const APPROVAL_COUNT_TTL_MS = 5_000;
const approvalCountCache = new Map<
  string,
  { value: number; expiresAt: number }
>();

export function readCachedApprovalCount(cacheKey: string) {
  const cached = approvalCountCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.value;
}

export function writeCachedApprovalCount(cacheKey: string, value: number) {
  approvalCountCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + APPROVAL_COUNT_TTL_MS,
  });
}

export function invalidatePendingApprovalCountCache() {
  approvalCountCache.clear();
}
