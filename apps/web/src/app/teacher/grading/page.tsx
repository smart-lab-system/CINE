import { ClipboardCheck } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export default function GradingPage() {
  return (
    <PlaceholderPage
      icon={ClipboardCheck}
      title="Chấm điểm"
      description="Xem điểm AI đề xuất kèm bằng chứng theo rubric, duyệt/sửa và chốt điểm sẽ có ở đây."
    />
  );
}
