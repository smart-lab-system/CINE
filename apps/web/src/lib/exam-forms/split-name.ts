/**
 * Split a full Vietnamese name into họ+đệm and tên (last token), per
 * exam-form spec §6.2. Used when filling student lists later; samples are
 * already split by hand.
 */
export function splitStudentName(full: string): { hoDem: string; ten: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length === 0) {
    return { hoDem: '', ten: '' };
  }
  if (parts.length === 1) {
    return { hoDem: parts[0], ten: parts[0] };
  }
  const ten = parts[parts.length - 1];
  const hoDem = parts.slice(0, -1).join(' ');
  return { hoDem, ten };
}
