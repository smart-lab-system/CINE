import { Bot } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export default function AiConfigPage() {
  return (
    <PlaceholderPage
      icon={Bot}
      title="Cấu hình AI"
      description="Quản lý model cascade và ngưỡng confidence cho việc chấm điểm AI sẽ có ở đây."
    />
  );
}
