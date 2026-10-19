import { hasComment } from './comment-presence';
import { shortNameDeclarations } from './short-names';

/**
 * Kết quả của bộ kiểm tra tất định cho hai luật phong cách, chạy ở CHẾ ĐỘ BÓNG: chỉ ghi để đo, không ảnh hưởng
 * điểm hay quyết định tự duyệt. Hai luật hiện do LLM đánh giá (`llm_only`).
 */
export interface ShadowStyleVerdict {
  /** Luật `thieu_chu_thich`: bài không có chú thích nào. */
  thieuChuThich: boolean;
  /** Luật `ten_bien_vo_nghia`: có ít nhất một tên 1–2 ký tự không nằm trong ngoại lệ của câu. */
  tenBienVoNghia: boolean;
  shortNames: string[];
}

export function shadowStyleVerdict(source: string, opts: { exceptions?: string[] } = {}): ShadowStyleVerdict {
  const shortNames = shortNameDeclarations(source, { exceptions: opts.exceptions ?? [] });
  return {
    thieuChuThich: !hasComment(source),
    tenBienVoNghia: shortNames.length > 0,
    shortNames,
  };
}
