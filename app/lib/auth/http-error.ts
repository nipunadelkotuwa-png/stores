export function rethrowAuthorizationError(error: unknown): void {
  if (error instanceof Response) throw error;
  const status = (error as { init?: { status?: number } } | null)?.init
    ?.status;
  if (status === 401 || status === 403) throw error;
}
