export const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 30;

export function parsePageSize(raw: string | null | undefined): PageSize {
  const n = Number(raw);
  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) {
    return n as PageSize;
  }
  return DEFAULT_PAGE_SIZE;
}

export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1) return n;
  return 1;
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Omit defaults so URLs stay short; parse helpers restore them on mount. */
export function paginationQueryPatch(
  page: number,
  pageSize: PageSize,
): { page: string | null; pageSize: string | null } {
  return {
    page: page > 1 ? String(page) : null,
    pageSize: pageSize !== DEFAULT_PAGE_SIZE ? String(pageSize) : null,
  };
}
