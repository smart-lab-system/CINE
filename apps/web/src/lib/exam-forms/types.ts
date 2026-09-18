/**
 * Three administrative Excel form kinds — column contracts live in
 * `schemas.ts` and must match
 * docs/superpowers/specs/2026-09-18-exam-form-excel-templates-design.md §§4–6.
 */

export type ExamFormKind =
  | 'lich-thi-tong-hop'
  | 'phan-cong-cbct'
  | 'ds-thisinh-theo-phong';

export interface ExamFormDefinition {
  kind: ExamFormKind;
  /** Vietnamese label shown in the UI. */
  label: string;
  /** Short one-line description under the label. */
  description: string;
  /** Excel worksheet name (ASCII, no spaces). */
  sheetName: string;
  /** Row-1 headers — exact strings, exact order. */
  headers: readonly string[];
}

/** One data row as cell values aligned with `headers`. */
export type ExamFormRow = readonly (string | number)[];
