import type { BuiltExamForm } from './build-workbook';

/**
 * Triggers a browser file download from an in-memory workbook. Client-only
 * — must not run during SSR.
 */
export function downloadExamFormWorkbook(built: BuiltExamForm): void {
  // Copy into a fresh ArrayBuffer so Blob gets a plain buffer (not a
  // SharedArrayBuffer-backed view from exceljs writeBuffer).
  const copy = new Uint8Array(built.bytes.byteLength);
  copy.set(built.bytes);
  const blob = new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = built.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
