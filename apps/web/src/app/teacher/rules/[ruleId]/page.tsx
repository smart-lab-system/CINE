import { redirect } from 'next/navigation';

/**
 * Trang sửa luật riêng đã bỏ: sửa lỗi nay là ngăn kéo trong Bảng lỗi. Giữ đường dẫn để dấu trang cũ không rơi vào 404.
 */
export default function EditRulePage(): never {
  redirect('/teacher/rules');
}
