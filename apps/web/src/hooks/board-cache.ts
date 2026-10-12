import type { QueryClient } from '@tanstack/react-query';

/**
 * Mọi thao tác GHI ở Bảng lỗi đổi cả tổng quan, danh sách lỗi của rubric, thư viện và lỗi AI đề xuất (đếm trên
 * dải trạng thái đọc từ tổng quan). Hai họ khoá, một hàm — để không thao tác nào quên một nửa.
 */
export function invalidateBoard(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['rubric-errors'] });
  void queryClient.invalidateQueries({ queryKey: ['rules'] });
}
