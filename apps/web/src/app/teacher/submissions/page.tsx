import { Inbox } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export default function SubmissionsPage() {
  return (
    <PlaceholderPage
      icon={Inbox}
      title="Quản lý bài thu"
      description="Xem trạng thái thu bài (đã nộp/nộp qua backup/chưa nộp) theo từng phiên thi sẽ có ở đây."
    />
  );
}
