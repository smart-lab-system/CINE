/** Nhãn lớp danh nghĩa: `code` hoặc `code — name`. */
export function formatNominalClassLabel(
  code: string | null | undefined,
  name: string | null | undefined,
): string | null {
  if (!code) return null;
  return name ? `${code} — ${name}` : code;
}
