/**
 * Mã lớp danh nghĩa là phần đứng trước ` — ` trong nhãn
 * `code` hoặc `code — name` (xem TeachingClass.nominalClassName).
 */
export function nominalClassCodeFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  const separator = ' — ';
  const index = trimmed.indexOf(separator);
  const code = (index === -1 ? trimmed : trimmed.slice(0, index)).trim();
  return code || null;
}

/** `mã lớp học phần - mã lớp danh nghĩa`. Không có mã danh nghĩa thì chỉ hiện mã học phần. */
export function formatSectionAndNominalClass(
  sectionCode: string | null | undefined,
  nominalClassLabel: string | null | undefined,
): string | null {
  const section = sectionCode?.trim() || null;
  const nominal = nominalClassCodeFromLabel(nominalClassLabel);
  if (section && nominal) return `${section} - ${nominal}`;
  return section;
}
