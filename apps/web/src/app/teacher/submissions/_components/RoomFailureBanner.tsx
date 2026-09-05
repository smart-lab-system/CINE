import { TriangleAlert } from 'lucide-react';

/**
 * Chỉ hiện khi dữ liệu đã tự nói ra kết luận: mọi phiên nghi-mất-bài đang xem
 * cùng một phòng, >=2 phiên, trải >=2 môn. Lúc đó vấn đề gần như chắc chắn là
 * máy/mạng của phòng, và bắt giảng viên tự ghép ba dòng lại để nhận ra là
 * bắt họ làm việc mà hệ thống làm được. Spec §5.5.
 */
export function RoomFailureBanner({
  room, sessionCount, courseCount,
}: { room: string; sessionCount: number; courseCount: number }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-danger-subtle bg-danger-subtle/40 px-4 py-3 text-small text-danger-strong"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Cả <strong>{sessionCount} phiên nghi mất bài</strong> trong phạm vi này đều ở phòng{' '}
        <strong>{room}</strong>, trải {courseCount} môn khác nhau — nhiều khả năng là sự cố
        máy/mạng của phòng, không phải do sinh viên.
      </span>
    </div>
  );
}
