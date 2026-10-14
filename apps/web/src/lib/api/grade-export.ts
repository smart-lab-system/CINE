import { apiClient } from '@/lib/api-client';

/** Mirrors `apps/api/src/grade-export/` — spec `2026-09-29-gradebook-export-design.md` §4.5-4.6. */
export type BlankReason = 'absent' | 'not_finished' | 'ungradable' | 'flagged';
export type RowAction = 'write' | 'blank' | 'kept' | 'unmatched' | 'duplicate' | 'conflict' | 'skipped_formula' | 'skipped_merged';
export type Direction = 'up' | 'down' | 'same' | 'new';
/** Bốn bước làm tròn mà server chấp nhận (phần trăm điểm) — OpenAPI sinh đúng bốn giá trị này. */
export type RoundingStep = 1 | 10 | 25 | 50;
export type Cause =
  | { kind: 'rule'; ruleKey: string; ruleName: string | null; delta: number }
  | { kind: 'manual_score' }
  | { kind: 'review' }
  | { kind: 'rounding' }
  | { kind: 'unknown' };

export interface GridCell {
  text: string;
  kind: 'empty' | 'text' | 'number';
  formula: boolean;
}
export interface InspectGrid {
  name: string;
  rowCount: number;
  columnCount: number;
  protected: boolean;
  fromRow: number;
  columns: string[];
  rows: { row: number; cells: GridCell[] }[];
  hasMore: boolean;
}
export interface InspectResponse {
  templateId: string;
  fileSizeBytes: number;
  sheets: { name: string; hidden: boolean }[];
  deliverables: { id: string; requiredFilename: string }[];
  sheet: InspectGrid | null;
}
export interface InspectRequest {
  templateId: string;
  sheetName?: string;
  fromRow?: number;
}

export interface PlanRequest {
  templateId: string;
  sheetName: string;
  firstDataRow: number;
  mssvColumn: string;
  scoreColumn: string;
  reasonColumn?: string;
  deliverableId?: string;
  roundingStepHundredths: RoundingStep;
}
export interface WriteRequest extends PlanRequest {
  expectedDigest: string;
  templateFileName: string;
  overwriteExisting?: boolean;
  confirmDecreases?: boolean;
}

export interface PlanRowView {
  row: number;
  mssvInFile: string;
  studentMssv: string | null;
  studentName: string | null;
  action: RowAction;
  /** Chuỗi thập phân ("7.25"); định dạng dấu phẩy ở `scoreText`. */
  systemScore: string | null;
  writtenScore: string | null;
  blankReason: BlankReason | null;
  blankLabel: string | null;
  previousScore: string | null;
  direction: Direction | null;
  causes: Cause[];
  note: string | null;
}
export interface NotInFileView {
  mssv: string;
  name: string;
  blankReason: BlankReason | null;
  blankLabel: string | null;
  score: string | null;
}
export interface CauseTally {
  kind: Cause['kind'];
  ruleKey: string | null;
  ruleName: string | null;
  students: number;
}
export interface ChangesSummary {
  previousExports: number;
  up: number;
  down: number;
  same: number;
  new: number;
  downByCause: CauseTally[];
  upByCause: CauseTally[];
}
export interface PlanResponse {
  digest: string;
  deliverableId: string | null;
  roundingStepHundredths: number;
  summary: { write: number; blank: number; kept: number; unmatched: number; duplicates: number; skipped: number; ignoredEmpty: number; notInFile: number };
  overwrite: { score: number; reason: number };
  changes: ChangesSummary | null;
  blockers: string[];
  canWrite: boolean;
  rows: PlanRowView[];
  notInFile: NotInFileView[];
}
export interface WriteResponse {
  exportId: string;
  fileName: string;
  downloadUrl: string;
  summary: { written: number; blank: number; kept: number; unmatched: number; skipped: number; overwritten: number; decreased: number };
  blank: { row: number; mssv: string; name: string; reason: BlankReason; label: string; kept: boolean }[];
}
export interface ExportListItem {
  id: string;
  exportedAt: string | null;
  sheetName: string | null;
  firstDataRow: number | null;
  mssvColumn: string;
  scoreColumn: string;
  reasonColumn: string | null;
  deliverableName: string | null;
  roundingStepHundredths: number;
  written: number;
  blank: number;
  unmatched: number;
  overwritten: number;
  decreased: number;
  decreaseConfirmedBy: string | null;
  exportedByName: string;
  templateFileName: string | null;
  outputFileName: string | null;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

/**
 * Xin URL ký, `PUT` byte THẲNG lên storage rồi trả `templateId` — file không đi qua NestJS (CLAUDE.md Security rule 5;
 * cùng đường `uploadExamMaterial` đi). Chưa có dòng DB nào cho tới khi xuất.
 */
export async function uploadTemplate(sessionId: string, file: File): Promise<string> {
  const minted = await apiClient.POST('/exam-sessions/{id}/grade-exports/template-upload', {
    params: { path: { id: sessionId } },
    body: { fileName: file.name, fileSize: file.size },
  });
  if (minted.error || !minted.response.ok) throw fail(minted.error, minted.response);
  const { templateId, uploadUrl } = minted.data as unknown as { templateId: string; uploadUrl: string };
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!put.ok) throw new Error(`Không tải được file lên kho lưu trữ (HTTP ${put.status}).`);
  return templateId;
}

export async function inspectTemplate(sessionId: string, body: InspectRequest): Promise<InspectResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports/inspect', {
    params: { path: { id: sessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as InspectResponse;
}

export async function previewExport(sessionId: string, body: PlanRequest): Promise<PlanResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports/preview', {
    params: { path: { id: sessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as PlanResponse;
}

export async function writeExport(sessionId: string, body: WriteRequest): Promise<WriteResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports', {
    params: { path: { id: sessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as WriteResponse;
}

export async function listExports(sessionId: string): Promise<ExportListItem[]> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/grade-exports', {
    params: { path: { id: sessionId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as ExportListItem[];
}

export async function getExportDownload(exportId: string): Promise<{ downloadUrl: string; fileName: string }> {
  const { data, error, response } = await apiClient.GET('/grade-exports/{id}/download', {
    params: { path: { id: exportId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { downloadUrl: string; fileName: string };
}
