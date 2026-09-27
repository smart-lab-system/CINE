'use client';

import { Badge } from '@/components/ui/badge';
import type { Rule } from '@/lib/api/rules';

export function MissingRulesPanel({ rules }: { rules: Rule[] }) {
  if (rules.length === 0) return null;
  return (
    <section className="rounded-lg border border-warning/60 bg-warning-subtle/40 p-4">
      <h3 className="text-small font-semibold">Luật agent báo còn thiếu ({rules.length})</h3>
      <p className="mt-1 text-caption text-muted-foreground">
        Agent gặp lỗi không khớp luật nào đã có. Xử lý bằng cách tạo luật thật từ đây, hoặc đánh dấu
        không phải lỗi — chưa xử lý thì các bài này không tự quyết được.
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-small">
            <Badge variant="warning">proposed</Badge>
            {rule.revision.description}
          </li>
        ))}
      </ul>
    </section>
  );
}
