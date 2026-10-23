'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';

export interface SetupChecklistInput {
  status: string;
  startTime: string;
  endTime: string;
  studentCount: number | null;
  materialCount: number | null;
  hasRubric: boolean;
  /** create-slim: mở phiên bắt buộc ≥ 1 file. */
  deliverableCount: number;
}

export interface SetupChecklistResult {
  canOpen: boolean;
  blockReason: string | null;
  warnings: string[];
}

/** Luật checklist sẵn sàng mở — spec §5.4. */
export function evaluateSetupChecklist(input: SetupChecklistInput): SetupChecklistResult {
  const warnings: string[] = [];
  const start = Date.parse(input.startTime);
  const end = Date.parse(input.endTime);
  const now = Date.now();

  if (input.status === 'missed') {
    return {
      canOpen: false,
      blockReason: 'Phiên không diễn ra — không mở được.',
      warnings,
    };
  }
  if (input.status !== 'scheduled' && input.status !== 'not_ready') {
    return {
      canOpen: false,
      blockReason: 'Chỉ mở được phiên đang ở trạng thái Sắp diễn ra hoặc Chưa đủ điều kiện.',
      warnings,
    };
  }
  if (!(end > start)) {
    return {
      canOpen: false,
      blockReason: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
      warnings,
    };
  }
  if (end <= now) {
    return {
      canOpen: false,
      blockReason: 'Khung giờ thi đã qua — hãy sửa lịch trước khi mở.',
      warnings,
    };
  }
  if (input.deliverableCount < 1) {
    return {
      canOpen: false,
      blockReason: 'Hãy cấu hình thư mục bài thi (ít nhất 1 file nộp) trước khi mở phiên.',
      warnings,
    };
  }

  if (input.studentCount === 0) {
    warnings.push('Lớp chưa có sinh viên — mở phiên sẽ bị từ chối cho đến khi nhập roster.');
  }
  if (input.materialCount === 0) {
    warnings.push('Chưa có đề phát cho sinh viên.');
  }
  if (!input.hasRubric) {
    warnings.push('Chưa gắn rubric — sẽ cần trước khi chấm.');
  }

  return { canOpen: true, blockReason: null, warnings };
}

export function SetupChecklist({ result }: { result: SetupChecklistResult }) {
  if (result.blockReason) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.blockReason}</AlertDescription>
      </Alert>
    );
  }
  if (result.warnings.length === 0) {
    return (
      <Alert variant="success">
        <AlertDescription>Đủ điều kiện mở phiên — có thể mở cửa cho sinh viên.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning">
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
