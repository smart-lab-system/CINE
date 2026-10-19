import { getAccessToken } from '@/lib/auth-token';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class IdeUtilitiesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'IdeUtilitiesHttpError';
  }
}

async function ideFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(', ');
    } catch {
      /* ignore */
    }
    throw new IdeUtilitiesHttpError(message, res.status);
  }
  if (res.headers.get('content-type')?.includes('json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export type CatalogStatus =
  | 'wildcard_approved'
  | 'fully_approved'
  | 'has_pending'
  | 'none_approved';

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  wildcard_approved: 'Duyệt mọi phiên bản (*)',
  fully_approved: 'Đã duyệt hết',
  has_pending: 'Có chờ duyệt',
  none_approved: 'Chưa duyệt',
};

export interface CatalogExtension {
  id: string;
  identifier: string;
  displayName: string;
  publisher: string;
  publishedAt: string | null;
  lastReleasedAt: string | null;
  marketplaceSyncedAt?: string | null;
  isActive: boolean;
  catalogStatus: CatalogStatus;
}

export interface CatalogVersion {
  id: string;
  extensionPk: string;
  version: string;
  addedAt: string;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  approvedAt: string | null;
  approvedBy: string | null;
  note: string | null;
}

export interface CatalogExtensionDetail extends CatalogExtension {
  versions: CatalogVersion[];
}

export interface PolicyItem {
  id: string;
  policyId: string;
  extensionId: string;
  displayName: string | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  note: string | null;
}

export interface ExtensionScan {
  id: string;
  studentMssv: string;
  machineId: string;
  machineName: string | null;
  scannedAt: string;
  extensionCount: number;
  violationCount: number;
  status: 'clean' | 'has_violations';
  labMgmtSessionId: string | null;
  courseId: string | null;
}

export interface ScanItem {
  extensionId: string;
  displayName?: string | null;
  verdict: string;
  matchedScope: string | null;
  version: string | null;
}

export function listCatalog() {
  return ideFetch<CatalogExtension[]>('/ide-extensions/catalog');
}

export function getCatalog(id: string) {
  return ideFetch<CatalogExtensionDetail>(`/ide-extensions/catalog/${id}`);
}

export function createCatalog(body: {
  identifier: string;
  displayName: string;
  publisher: string;
  publishedAt?: string;
  lastReleasedAt?: string;
}) {
  return ideFetch<CatalogExtension>('/ide-extensions/catalog', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function refreshMarketplace(extensionId: string) {
  return ideFetch<CatalogExtension & { refreshed: boolean }>(
    `/ide-extensions/catalog/${extensionId}/refresh-marketplace`,
    { method: 'POST' },
  );
}

export function addCatalogVersion(extensionId: string, body: { version: string; note?: string }) {
  return ideFetch<CatalogVersion>(`/ide-extensions/catalog/${extensionId}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function catalogFromScan(body: {
  extensionId: string;
  version?: string;
  displayName?: string;
}) {
  return ideFetch<{
    extension: CatalogExtension;
    version: CatalogVersion | null;
    createdExtension: boolean;
    createdVersion: boolean;
    alreadyExists: boolean;
  }>('/ide-extensions/catalog/from-scan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function approveVersion(versionId: string) {
  return ideFetch<CatalogVersion>(`/ide-extensions/versions/${versionId}/approve`, {
    method: 'PATCH',
  });
}

export function unapproveVersion(versionId: string) {
  return ideFetch<CatalogVersion>(`/ide-extensions/versions/${versionId}/unapprove`, {
    method: 'PATCH',
  });
}

export function deleteVersion(versionId: string) {
  return ideFetch<void>(`/ide-extensions/versions/${versionId}`, { method: 'DELETE' });
}

export function listCourseItems(courseId: string) {
  return ideFetch<PolicyItem[]>(`/ide-extensions/policies/course/${courseId}/items`);
}

export function addCourseItem(body: {
  courseId: string;
  extensionId: string;
  displayName?: string;
  note?: string;
}) {
  return ideFetch<PolicyItem>('/ide-extensions/policies/course/items', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function approveItem(id: string) {
  return ideFetch<PolicyItem>(`/ide-extensions/policies/items/${id}/approve`, {
    method: 'PATCH',
  });
}

export function rejectItem(id: string) {
  return ideFetch<PolicyItem>(`/ide-extensions/policies/items/${id}/reject`, {
    method: 'PATCH',
  });
}

export function removeItem(id: string) {
  return ideFetch<void>(`/ide-extensions/policies/items/${id}`, { method: 'DELETE' });
}

export function listScans(params?: { labMgmtSessionId?: string; courseId?: string }) {
  const sp = new URLSearchParams();
  if (params?.labMgmtSessionId) sp.set('labMgmtSessionId', params.labMgmtSessionId);
  if (params?.courseId) sp.set('courseId', params.courseId);
  const q = sp.toString();
  return ideFetch<ExtensionScan[]>(`/ide-extensions/scans${q ? `?${q}` : ''}`);
}

export function getScan(id: string) {
  return ideFetch<ExtensionScan & { items: ScanItem[] }>(`/ide-extensions/scans/${id}`);
}
