import { formatVnPoints } from '@/lib/format';
import type { ResultDetail } from '@/lib/api/grading';

type Breakdown = NonNullable<ResultDetail['breakdown']>;

export function ScoreCard({
  currentScore,
  currentScoreSource,
  breakdown,
}: {
  currentScore: number | null;
  currentScoreSource: string;
  breakdown: Breakdown | null;
}) {
  // Chấm tay thắng mọi thứ: đã có người đặt điểm thì bài CÓ điểm, dù breakdown còn mang lý do "dưới sàn"
  // (setManualScore không xoá nó — review I2).
  if (currentScoreSource === 'manual') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <span className="text-caption font-semibold text-muted-foreground">Điểm — do bạn chấm tay</span>
        <span className="text-3xl font-semibold tabular-nums">{formatVnPoints(currentScore)}</span>
        <p className="text-caption text-muted-foreground">
          Điểm này không theo công thức luật/giá — bạn đã chấm tay bài này.
        </p>
      </section>
    );
  }

  // "Dưới sàn" (§4.4): điều tra CHẠY XONG, nhưng chấm điểm từ chối công bố
  // một con số — khác hẳn "không chấm được" (điều tra không chạy được gì).
  // Nói nhầm cái này thành cái kia là nói với giảng viên rằng sandbox chết
  // trong khi nó chạy bình thường.
  if (breakdown?.ungradable) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-warning bg-warning/5 p-4">
        <span className="text-caption font-semibold text-muted-foreground">Điểm</span>
        <span className="text-3xl font-semibold tabular-nums text-muted-foreground">—</span>
        <p className="text-small text-warning-strong">{breakdown.ungradable.reason}</p>
        <p className="text-caption text-muted-foreground">
          Cuộc điều tra đã đọc và chạy được bài làm này — hệ thống chỉ từ chối tự cho điểm. Chấm tay để bài này có
          điểm.
        </p>
      </section>
    );
  }

  const total = breakdown?.perCriterion.reduce((sum, c) => sum + c.maxHundredths, 0) ?? 0;
  const terms = (breakdown?.perCriterion ?? []).filter((c) => c.deductedHundredths > 0);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <span className="text-caption font-semibold text-muted-foreground">
        {currentScoreSource === 'finalized' ? 'Điểm — đã chốt' : 'Điểm tạm tính'}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{formatVnPoints(currentScore)}</span>
      {breakdown && (
        <p className="font-mono text-small text-muted-foreground">
          {formatVnPoints(total / 100)}
          {terms.map((c) => ` − ${formatVnPoints(c.deductedHundredths / 100)}`).join('')} = {formatVnPoints(currentScore)}
        </p>
      )}
      {terms.map((c) => (
        <p key={c.key} className="text-caption text-muted-foreground">
          {c.key}: −{formatVnPoints(c.deductedHundredths / 100)}
          {c.capped && ' (chạm trần)'}
        </p>
      ))}
      <p className="text-caption text-muted-foreground">Mức trừ lấy từ Bảng lỗi — mô hình không đặt con số nào.</p>
    </section>
  );
}
