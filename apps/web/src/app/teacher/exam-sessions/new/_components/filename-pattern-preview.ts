/**
 * What the server fills each token with, and a sample value for the
 * preview.
 *
 * The samples are already ASCII and separator-free on purpose: for values
 * like these the server's rendering is pure substitution, so the preview is
 * exactly what a student would get without this file having to carry a
 * second copy of the server's normalizer. A name with diacritics is
 * stripped there — said in the form note rather than half-imitated here.
 */
export const FILENAME_TOKENS = [
  { token: '{MSSV}', label: 'MSSV', sample: 'SV20120001' },
  { token: '{TEN}', label: 'Họ tên', sample: 'NguyenVanAn' },
  { token: '{PHONG}', label: 'Phòng', sample: 'PhongMayA1' },
  { token: '{SOMAY}', label: 'Số máy', sample: 'MAY07' },
] as const;

export function previewFilenamePattern(pattern: string): string {
  return FILENAME_TOKENS.reduce(
    (rendered, { token, sample }) => rendered.split(token).join(sample),
    pattern,
  );
}

export function isTemplatedFilename(pattern: string): boolean {
  return FILENAME_TOKENS.some(({ token }) => pattern.includes(token));
}
