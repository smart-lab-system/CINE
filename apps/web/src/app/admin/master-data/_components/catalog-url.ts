/** Ghi query params bằng replace — bỏ key khi giá trị rỗng / 'all'. */
export function buildCatalogQuery(
  current: URLSearchParams,
  patch: Record<string, string | undefined | null>,
): string {
  const sp = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === '' || value === 'all') sp.delete(key);
    else sp.set(key, value);
  }
  return sp.toString();
}
