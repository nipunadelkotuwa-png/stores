export function movementFiltersFromSearch(search: URLSearchParams) {
  return {
    documentNumber: search.get("posted")?.trim() || undefined,
    purchaseNumber: search.get("purchase")?.trim() || undefined,
  };
}
