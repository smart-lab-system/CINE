'use client';

import { useMemo } from 'react';
import { isMakeupSubmission } from '@/lib/grading-triage';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  groupOf,
  type ReviewGroup,
} from '@/lib/grading-groups';
import type { GradingResult } from '@/lib/api/grading';

/**
 * Danh sách bài của một phiên, nhóm theo trạng thái.
 *
 * TỪ 2026-09-16 đây là danh sách thuần: khung chấm chi tiết chuyển sang route
 * riêng `/teacher/grading/[resultId]`. Lý do là không gian — split-view cần
 * hai cột 50-50 cho bài làm và thang chấm, và nhét nó vào nửa phải của một
 * trang đã có rail trái thì cả hai bên đều chật. Route riêng cũng cho một
 * đường dẫn trỏ thẳng vào một bài, thứ cần thật khi sinh viên phúc khảo.
 *
 * Vẫn KHÔNG phải chế độ toàn màn hình một bài: danh sách này giữ nguyên
 * "còn bao nhiêu bài cần duyệt", mà đó chính là điều kiện bật nút Chốt.
 */
export function ReviewWorkspace({
  examSessionId,
  results,
  sessionClassId,
}: {
  examSessionId: string;
  results: GradingResult[];
  /** Lớp của phiên. So với lớp gốc của từng bài để biết ai thi bù. */
  sessionClassId: string | null;
}) {
  const grouped = useMemo(() => {
    const map = new Map<ReviewGroup, GradingResult[]>();
    for (const result of results) {
      const group = groupOf(result.status);
      map.set(group, [...(map.get(group) ?? []), result]);
    }
    return map;
  }, [results]);

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-small text-muted-foreground">Chưa có bài nào để duyệt.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <nav className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_ORDER.filter((group) => (grouped.get(group)?.length ?? 0) > 0).map(
            (group) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-caption font-semibold text-muted-foreground">
                  {GROUP_LABELS[group]} ({grouped.get(group)!.length})
                </p>
                {grouped.get(group)!.map((result) => (
                  <Link
                    key={result.id}
                    href={`/teacher/grading/${result.id}?sessionId=${examSessionId}`}
                    className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-small hover:bg-surface-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{result.studentName}</span>
                      {/* Cùng phép so sánh với màn bài nộp, cùng nhãn: một
                          khái niệm hiện ra hai kiểu là hai khái niệm với
                          người đọc. */}
                      {isMakeupSubmission(result.homeClassId, sessionClassId) && (
                        <Badge variant="info" className="shrink-0">
                          Thi bù — {result.homeClassName ?? result.homeClassId}
                        </Badge>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {/* Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc
                          duyệt. `?? aiTotalScore` chứ không phải `|| `: điểm 0
                          do giảng viên chấm là một quyết định, không phải một
                          giá trị trống. */}
                      {result.finalScore ?? result.aiTotalScore ?? '—'}
                    </span>
                  </Link>
                ))}
              </div>
            ),
          )}
        </nav>
      </CardContent>
    </Card>
  );
}
