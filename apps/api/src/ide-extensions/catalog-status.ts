/** Spec §6.3 — derived catalog list status. */

export type CatalogStatus =
  | 'wildcard_approved'
  | 'fully_approved'
  | 'has_pending'
  | 'none_approved';

export interface VersionStatusInput {
  version: string;
  approvalStatus: 'approved' | 'pending' | 'rejected';
}

export function deriveCatalogStatus(versions: VersionStatusInput[]): CatalogStatus {
  if (versions.some((v) => v.version === '*' && v.approvalStatus === 'approved')) {
    return 'wildcard_approved';
  }
  if (versions.some((v) => v.approvalStatus === 'pending')) {
    return 'has_pending';
  }
  if (versions.length > 0 && versions.every((v) => v.approvalStatus === 'approved')) {
    return 'fully_approved';
  }
  return 'none_approved';
}

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  wildcard_approved: 'Duyệt mọi phiên bản (*)',
  fully_approved: 'Đã duyệt hết',
  has_pending: 'Có chờ duyệt',
  none_approved: 'Chưa duyệt',
};
