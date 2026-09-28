import { Logger } from '@nestjs/common';

/**
 * Suy "họ" model từ id — heuristic, không phải khoá học thuật: bỏ tiền tố nhà cung cấp
 * (`vendor/`) và hậu tố biến thể phổ biến (`-flash`, `-mini`, `-lite`, `-turbo`). Đủ để bắt
 * đúng ca thật của đồ án (`cnb/glm-5.3` và `spd/glm-5.3-flash` là hai bậc CÙNG HỌ glm-5.3) mà
 * không cần một bảng ánh xạ nhà cung cấp đầy đủ.
 */
export function familyOf(model: string): string {
  const afterSlash = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return afterSlash.replace(/-(flash|mini|lite|turbo)$/i, '');
}

/**
 * §6.3: "phải là cảnh báo lúc KHỞI ĐỘNG, không phải một dòng cuối báo cáo" — gọi đúng một lần
 * lúc dựng `InvestigatorDeps`, không lặp lại mỗi bài.
 */
export function warnIfSameFamily(
  graderModels: string[],
  challengerModels: string[],
  log: (message: string) => void = (m) => new Logger('ChallengeLenses').warn(m),
): void {
  const graderFamilies = new Set(graderModels.map(familyOf));
  const overlap = challengerModels.map(familyOf).filter((f) => graderFamilies.has(f));
  if (overlap.length > 0) {
    log(
      `Bậc chấm và bậc phản biện cùng họ model (${[...new Set(overlap)].join(', ')}) — ` +
        'phép phản biện ở cấu hình này chỉ đo được NHIỄU, không đo được THIÊN LỆCH (§6.3). ' +
        'Ghi rõ điều này khi báo cáo kết quả phản biện.',
    );
  }
}
