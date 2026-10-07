'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import type { GradingResult } from '@/lib/api/grading';
import { groupByUngradableReason } from '@/lib/regrade-triage';
import { RegradeButton } from './RegradeButton';

/**
 * Băng "Dịch vụ AI lỗi" (UI spec §3.8, hàng "dịch vụ AI lỗi"): nhiều bài lớp system dừng vì CÙNG một lý do.
 *
 * Nó đo "cùng lý do", KHÔNG đo "trong một khoảng ngắn" như spec §4 mô tả: danh sách kết quả không mang lúc từng bài
 * dừng, nên khoảng thời gian không đo được — và băng nói thẳng điều đó thay vì giả vờ. Một bài đơn lẻ là lỗi bình
 * thường, không phải sự cố; từ hai bài cùng lý do trở lên mới hiện.
 */
export function AiServiceBand({ sessionId, results }: { sessionId: string; results: GradingResult[] }) {
  const top = groupByUngradableReason(results)[0];
  if (!top || top.count < 2) return null;

  return (
    <Alert variant="warning">
      <AlertDescription className="flex flex-col gap-2">
        <span>
          <strong>Dịch vụ AI lỗi — {top.count} bài không chấm được cùng một lý do:</strong> “{top.reason}”
        </span>
        <span className="text-caption">
          Đếm theo cùng một lý do trong danh sách hiện tại — không đo được khoảng thời gian, vì danh sách không ghi lúc
          từng bài dừng. Khi dịch vụ đã ổn, chấm lại các bài này; bài khác lý do giữ nguyên.
        </span>
        <span>
          <RegradeButton
            scope={{ kind: 'session', sessionId, reason: top.reason, count: top.count }}
            label={`Chấm lại ${top.count} bài này`}
          />
        </span>
      </AlertDescription>
    </Alert>
  );
}
