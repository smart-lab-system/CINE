import { CalendarClock } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

// Phase 0 placeholder — becomes the real "Quản lý kỳ thi" list (paginated
// table, GET /exam-sessions) in Phase 2, once that endpoint exists. Kept as
// a real route now so the nav item never dead-links.
export default function ExamSessionsListPage() {
  return (
    <PlaceholderPage
      icon={CalendarClock}
      title="Quản lý kỳ thi"
      description="Danh sách các phiên thi đã tạo, kèm trạng thái và lối vào phòng chờ, sẽ có ở đây."
    />
  );
}
