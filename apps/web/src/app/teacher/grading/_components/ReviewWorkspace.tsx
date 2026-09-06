'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  groupOf,
  type ReviewGroup,
} from '@/lib/grading-groups';
import type { GradingResult } from '@/lib/api/grading';
import { ReviewDetail } from './ReviewDetail';

/**
 * Hai cột: rail trái là tiến độ cả phiên, khung phải là bài đang duyệt.
 *
 * Không phải bảng phẳng — duyệt bài là việc THEO TỪNG BÀI, cần chỗ cho đoạn
 * bằng chứng và ô sửa của từng tiêu chí; với 40 bài, bảng thành 40 lần đóng/mở.
 *
 * Cũng không phải chế độ toàn màn hình một bài: nó giấu mất "còn bao nhiêu bài
 * Cần xem", mà đó chính là điều kiện bật nút Chốt.
 */
export function ReviewWorkspace({
  examSessionId,
  results,
}: {
  examSessionId: string;
  results: GradingResult[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<ReviewGroup, GradingResult[]>();
    for (const result of results) {
      const group = groupOf(result.status);
      map.set(group, [...(map.get(group) ?? []), result]);
    }
    return map;
  }, [results]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    results.find((result) => result.id === selectedId) ?? results[0] ?? null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-0 p-0 md:grid-cols-[minmax(14rem,18rem)_1fr]">
        <nav className="flex flex-col gap-4 border-b border-border p-4 md:border-b-0 md:border-r">
          {GROUP_ORDER.filter((group) => (grouped.get(group)?.length ?? 0) > 0).map(
            (group) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-caption font-semibold text-muted-foreground">
                  {GROUP_LABELS[group]} ({grouped.get(group)!.length})
                </p>
                {grouped.get(group)!.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => setSelectedId(result.id)}
                    data-active={result.id === selected?.id}
                    className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-small hover:bg-surface-2 data-[active=true]:bg-surface-2"
                  >
                    <span className="truncate">{result.studentName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {/* Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc
                          duyệt. `?? aiTotalScore` chứ không phải `|| `: điểm 0
                          do giảng viên chấm là một quyết định, không phải một
                          giá trị trống. */}
                      {result.finalScore ?? result.aiTotalScore ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            ),
          )}
        </nav>

        <div className="p-6">
          {selected ? (
            <ReviewDetail
              key={selected.id}
              examSessionId={examSessionId}
              result={selected}
            />
          ) : (
            <p className="text-small text-muted-foreground">Chưa có bài nào để duyệt.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
