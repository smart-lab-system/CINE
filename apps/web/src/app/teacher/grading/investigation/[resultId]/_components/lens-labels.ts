const LENS_LABEL: Record<string, string> = {
  tinh_dung: 'Tính đúng',
  qua_tay: 'Quá tay',
  bo_sot: 'Bỏ sót',
  gian_lan: 'Gian lận',
};

export function lensLabel(key: string): string {
  return LENS_LABEL[key] ?? key;
}
