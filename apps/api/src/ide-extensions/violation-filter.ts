/** Spec 2026-11-18 §2 #2–3 / §5 — pair still open if not covered by global approved catalog. */

export interface ApprovedCatalogVersion {
  identifier: string;
  version: string;
}

/**
 * Returns true when `(extensionId, version)` should still appear on the Violations tab.
 * Closed (false) when global `*` is approved for the id, or exact version is approved.
 * `version = null` only closes when `*` is approved.
 */
export function isViolationPairStillOpen(
  extensionId: string,
  version: string | null,
  approved: ApprovedCatalogVersion[],
): boolean {
  const forId = approved.filter((a) => a.identifier === extensionId);
  if (forId.some((a) => a.version === '*')) return false;
  if (version == null || version === '') return true;
  if (forId.some((a) => a.version === version)) return false;
  return true;
}
