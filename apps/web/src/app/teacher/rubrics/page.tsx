import { redirect } from 'next/navigation';

/**
 * Trang Rubric đã bỏ: trần điểm theo tiêu chí giờ nằm cạnh các luật dùng chúng, ở Bảng lỗi (spec UI §3.1).
 * Giữ đường dẫn này để dấu trang, mục điều hướng cũ và các liên kết còn sót không dẫn tới trang 404.
 */
export default function RubricsRedirect(): never {
  redirect('/teacher/rules');
}
