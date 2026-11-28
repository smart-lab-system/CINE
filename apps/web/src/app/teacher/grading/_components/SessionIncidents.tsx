'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import type { GradingResult } from '@/lib/api/grading';
import { groupByUngradableReason } from '@/lib/regrade-triage';

/** Nhiều bài lớp system dừng vì CÙNG một lý do (UI spec §3.8, hàng "dịch vụ AI lỗi"). */
export interface AiServiceIncident {
  count: number;
  reason: string;
}

/** Bài còn "đang chấm" nhưng hàng đợi không còn việc sống. `stall` là "2 phút" (đã diễn đạt) hoặc `null` khi chưa đo được. */
export interface StuckIncident {
  count: number;
  stall: string | null;
}

/** Bài đã dừng; `regradable` là số bài trong đó chấm lại được (lỗi phía hệ thống). */
export interface StoppedIncident {
  count: number;
  regradable: number;
}

/**
 * Lỗi dịch vụ AI: nhóm lớn nhất "cùng một lý do" của các bài lớp system, và chỉ khi có từ hai bài trở lên (một bài
 * đơn lẻ là lỗi bình thường, không phải sự cố). Đo "cùng lý do", KHÔNG đo "trong một khoảng ngắn": danh sách kết quả
 * không mang lúc từng bài dừng, nên khoảng thời gian không đo được - và dòng nói thẳng điều đó.
 */
export function aiServiceIncident(results: GradingResult[]): AiServiceIncident | null {
  const top = groupByUngradableReason(results)[0];
  return top && top.count >= 2 ? { count: top.count, reason: top.reason } : null;
}

/**
 * MỘT thông báo sự cố cho cả màn phiên (spec Giai đoạn 2 §5.2): tối đa ba dòng, mỗi dòng chỉ hiện khi có, và một câu
 * chung chỉ tới nút chấm lại duy nhất ở đầu trang (`SessionHeader`) - chỉ khi có dòng mà nút đó giải quyết được.
 * Không có dòng nào thì không vẽ gì. Thông báo không có nút.
 */
export function SessionIncidents({
  aiService = null,
  stuck = null,
  stopped = null,
}: {
  aiService?: AiServiceIncident | null;
  stuck?: StuckIncident | null;
  stopped?: StoppedIncident | null;
}) {
  if (aiService === null && stuck === null && stopped === null) return null;
  const pointsToRegrade = aiService !== null || stuck !== null || (stopped !== null && stopped.regradable > 0);

  return (
    <Alert variant="warning">
      <AlertDescription className="flex flex-col gap-2">
        <ul role="list" className="flex flex-col gap-1.5">
          {aiService && (
            <li>
              <strong>Dịch vụ AI lỗi - {aiService.count} bài không chấm được cùng một lý do:</strong> “{aiService.reason}”. Đếm
              trong danh sách hiện tại, không đo được khoảng thời gian; chờ dịch vụ ổn rồi chấm lại.
            </li>
          )}
          {stuck && (
            <li>
              <strong>{stuck.count} bài đang bị kẹt</strong> - không còn tiến trình chấm nào xử lý chúng.
              {stuck.stall !== null && ` Không có bài nào hoàn thành trong ${stuck.stall}.`}
            </li>
          )}
          {stopped && (
            <li>
              <strong>{stopped.count} bài đã dừng.</strong> Bài dừng vì lỗi hệ thống chưa có điểm nào
              {stopped.regradable > 0 ? ` - ${stopped.regradable} bài trong số đó chấm lại được.` : '.'}
            </li>
          )}
        </ul>
        {pointsToRegrade && <span className="text-caption">Bấm nút chấm lại ở đầu trang để xếp lại các bài này.</span>}
      </AlertDescription>
    </Alert>
  );
}
