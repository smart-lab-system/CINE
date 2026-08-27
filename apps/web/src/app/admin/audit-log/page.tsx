import { ScrollText } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export default function AuditLogPage() {
  return (
    <PlaceholderPage
      icon={ScrollText}
      title="Audit log"
      description="Lịch sử mọi lần sửa điểm sau khi đã chốt (finalized) sẽ hiện ở đây, theo yêu cầu bắt buộc ghi log của CLAUDE.md."
    />
  );
}
