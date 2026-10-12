import { Bot, Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RulePredicate } from '@/lib/api/rules';
import { detectionOf } from '@/lib/error-form';

/** Hai cách phát hiện (D9). Lỗi cũ mang điều kiện lạ hiện như "AI đọc bài", ghi chú điều kiện nằm trong `title`. */
export function DetectionBadge({ predicate }: { predicate: RulePredicate | null }) {
  const d = detectionOf(predicate);
  if (d.detection === 'auto') {
    return (
      <Badge variant="primary">
        <Cpu className="h-3 w-3" aria-hidden="true" />
        Tự động
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary text-primary" title={d.legacyNote ? `Điều kiện cũ: ${d.legacyNote}` : undefined}>
      <Bot className="h-3 w-3" aria-hidden="true" />
      AI đọc bài
    </Badge>
  );
}
