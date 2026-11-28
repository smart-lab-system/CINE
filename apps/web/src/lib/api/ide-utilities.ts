import { getAccessToken } from '@/lib/auth-token';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

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

export type ExtractStatus = 'none' | 'pending' | 'extracting' | 'ready' | 'failed';

export interface CatalogVersion {
  id: string;
  extensionPk: string;
  version: string;
  addedAt: string;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  approvedAt: string | null;
  approvedBy: string | null;
  note: string | null;
  storageKey?: string | null;
  artifactSha256?: string | null;
  artifactSizeBytes?: string | null;
  artifactUploadedAt?: string | null;
  extractStatus?: ExtractStatus;
  extractError?: string | null;
  extractEntryCount?: number | null;
}

export type ExtractTreeNode =
  | { name: string; type: 'file'; size: number }
  | { name: string; type: 'dir'; children: ExtractTreeNode[] };

export interface VersionBrowseView {
  status: ExtractStatus;
  tree: { root: ExtractTreeNode[] } | null;
  entryCount: number | null;
  error: string | null;
  artifact: {
    storageKey: string | null;
    artifactSha256: string | null;
    artifactSizeBytes: string | null;
    artifactUploadedAt: string | null;
  };
}

export interface VersionBrowseFileView {
  downloadUrl: string;
  expiresIn: number;
  path: string;
  size: number | null;
}

export interface NormalizedSourceItem {
  id: string;
  prefix: string;
  title: string;
  language: string | null;
  path: string;
  content: string;
  truncated: boolean;
}

export interface NormalizedSourcesView {
  mode: 'snippets' | 'none';
  packageName: string | null;
  items: NormalizedSourceItem[];
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

export function getVersionBrowse(versionId: string) {
  return ideFetch<VersionBrowseView>(`/ide-extensions/versions/${versionId}/browse`);
}

export function getVersionBrowseFile(versionId: string, path: string) {
  const q = new URLSearchParams({ path });
  return ideFetch<VersionBrowseFileView>(
    `/ide-extensions/versions/${versionId}/browse/file?${q.toString()}`,
  );
}

export function requestVersionExtract(versionId: string) {
  return ideFetch<CatalogVersion>(`/ide-extensions/versions/${versionId}/extract`, {
    method: 'POST',
  });
}

export function getVersionNormalizedSources(versionId: string, opts?: { raw?: boolean }) {
  const q = new URLSearchParams();
  if (opts?.raw) q.set('raw', '1');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return ideFetch<NormalizedSourcesView>(
    `/ide-extensions/versions/${versionId}/normalized-sources${suffix}`,
  );
}

export type JplagDemoLanguage =
  | 'javascript'
  | 'typescript'
  | 'cpp'
  | 'python3'
  | 'java';

/** Dual-run labels: text vs language parser (SWC for JS/TS). */
export type JplagDemoRunProfile = 'text' | 'language';

export type JplagMatchPos = { line: number; column: number };

export interface JplagParsedMatch {
  firstPath: string;
  secondPath: string;
  startInFirst: JplagMatchPos;
  endInFirst: JplagMatchPos;
  startInSecond: JplagMatchPos;
  endInSecond: JplagMatchPos;
  lengthOfFirst: number;
  lengthOfSecond: number;
}

export interface JplagParsedFile {
  id: string;
  path: string;
  content: string;
}

export interface JplagRunView {
  profile: JplagDemoRunProfile;
  cliLanguage: string;
  similarity: number;
  firstSubmission: string | null;
  secondSubmission: string | null;
  extensionFileCount: number;
  compareFileCount: number;
  reportUrl: string | null;
  reportFilename: string | null;
  viewCommandHint: string | null;
  comparison: {
    files: JplagParsedFile[];
    matches: JplagParsedMatch[];
  } | null;
}

export interface JplagDemoResult {
  language: JplagDemoLanguage;
  runs: JplagRunView[];
  reportExpiresIn: number | null;
  message: string;
}

/** Demo JPlag - always runs text + language; multipart ZIP/folder + language. */
export async function postVersionJplagDemo(
  versionId: string,
  opts: {
    language: JplagDemoLanguage;
    archive?: File | null;
    files?: File[];
  },
): Promise<JplagDemoResult> {
  const token = await getAccessToken();
  const body = new FormData();
  body.append('language', opts.language);
  if (opts.archive) body.append('archive', opts.archive);
  for (const file of opts.files ?? []) {
    const rel =
      'webkitRelativePath' in file &&
      typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath === 'string' &&
      (file as File & { webkitRelativePath: string }).webkitRelativePath
        ? (file as File & { webkitRelativePath: string }).webkitRelativePath
        : file.name;
    body.append('files', file, rel);
  }

  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/ide-extensions/versions/${versionId}/jplag-demo`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const errBody = (await res.json()) as { message?: string | string[] };
      if (typeof errBody.message === 'string') message = errBody.message;
      else if (Array.isArray(errBody.message)) message = errBody.message.join(', ');
    } catch {
      /* ignore */
    }
    throw new IdeUtilitiesHttpError(message, res.status);
  }
  return (await res.json()) as JplagDemoResult;
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

export type IdeExtensionJplagRunKind = 'vs_model' | 'vs_student';
export type IdeExtensionJplagRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IdeExtensionJplagRun {
  id: string;
  examSessionId: string;
  extensionPk: string | null;
  versionId: string | null;
  extensionIdentifier: string;
  extensionVersion: string | null;
  kind: IdeExtensionJplagRunKind;
  status: IdeExtensionJplagRunStatus;
  trigger: 'scan' | 'submission' | 'manual';
  language: string | null;
  studentMssv: string | null;
  requiredDeliverableId: string | null;
  submissionId: string | null;
  similarityText: number | null;
  similarityLanguage: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdeExtensionJplagComparisonPayload {
  run: IdeExtensionJplagRun;
  profile: JplagDemoRunProfile;
  cliLanguage: string;
  similarity: number;
  firstSubmission: string | null;
  secondSubmission: string | null;
  comparison: {
    files: JplagParsedFile[];
    matches: JplagParsedMatch[];
  } | null;
  reportUrl: string | null;
}

export function listSessionJplagRuns(examSessionId: string) {
  return ideFetch<IdeExtensionJplagRun[]>(
    `/ide-extensions/jplag/sessions/${examSessionId}/runs`,
  );
}

export function getJplagRunComparison(
  runId: string,
  profile: JplagDemoRunProfile = 'text',
) {
  return ideFetch<IdeExtensionJplagComparisonPayload>(
    `/ide-extensions/jplag/runs/${runId}/comparison?profile=${profile}`,
  );
}

export function retryJplagVsModel(examSessionId: string, runId: string) {
  return ideFetch<IdeExtensionJplagRun>(
    `/ide-extensions/jplag/sessions/${examSessionId}/runs/${runId}/retry-vs-model`,
    { method: 'POST' },
  );
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

/** Spec 2026-11-18 - blocked pairs still open under global catalog approval. */
export interface ViolationIncident {
  scanId: string;
  scanItemId: string;
  examSessionId: string | null;
  examSessionName: string | null;
  courseId: string | null;
  courseName: string | null;
  studentMssv: string;
  studentFullName: string | null;
  machineId: string;
  machineName: string | null;
  scannedAt: string;
}

export interface ViolationVersion {
  version: string | null;
  incidentCount: number;
  incidents: ViolationIncident[];
}

export type ViolationExtractStatus =
  | 'none'
  | 'pending'
  | 'extracting'
  | 'ready'
  | 'failed';

export interface ViolationExtension {
  extensionId: string;
  displayName: string | null;
  publisher: string | null;
  /** ISO - catalog lastReleasedAt or publishedAt when known. */
  publishedAt?: string | null;
  inCatalog: boolean;
  catalogExtensionPk: string | null;
  primaryVersion?: string | null;
  primaryVersionId?: string | null;
  extractStatus?: ViolationExtractStatus;
  jplagText?: number | null;
  jplagStatus?: IdeExtensionJplagRunStatus | null;
  jplagRunId?: string | null;
  versionCount: number;
  incidentCount: number;
  studentCount: number;
  versions: ViolationVersion[];
}

export function listViolations(examSessionId?: string) {
  const q = examSessionId
    ? `?examSessionId=${encodeURIComponent(examSessionId)}`
    : '';
  return ideFetch<ViolationExtension[]>(`/ide-extensions/violations${q}`);
}
