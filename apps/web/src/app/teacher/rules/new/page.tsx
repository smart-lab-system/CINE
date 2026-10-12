import { redirect } from 'next/navigation';

/**
 * Trang tạo luật riêng đã bỏ (spec rules-by-rubric D11): thêm lỗi giờ là ngăn kéo ngay trong Bảng lỗi, có sẵn
 * rubric và tiêu chí. Giữ đường dẫn để dấu trang cũ không rơi vào 404.
 */
export default function NewRulePage(): never {
  redirect('/teacher/rules');
}
