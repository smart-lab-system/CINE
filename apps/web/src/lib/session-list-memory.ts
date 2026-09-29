const KEY = 'grading.list.query';

/**
 * Nhớ bộ lọc cuối cùng của danh sách trong TAB này (sessionStorage), để nút "Đổi phiên" ở trang một phiên
 * quay về đúng danh sách đã lọc. Không dùng localStorage: bộ lọc của hôm qua không nên chờ ở đầu buổi chấm
 * hôm nay. Mọi truy cập bọc try/catch — cửa sổ ẩn danh hoặc chặn dữ liệu trang làm cả accessor ném lỗi.
 */
export function rememberListQuery(query: string): void {
  try {
    if (query) sessionStorage.setItem(KEY, query);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* không nhớ được thì "Đổi phiên" về danh sách trần — chấp nhận được */
  }
}

export function recalledListHref(base = '/teacher/grading'): string {
  try {
    const query = sessionStorage.getItem(KEY);
    return query ? `${base}?${query}` : base;
  } catch {
    return base;
  }
}
