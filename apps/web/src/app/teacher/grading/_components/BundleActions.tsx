'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { useBundleRuns } from '@/hooks/useBundleRuns';
import { useGenerateTestBundle } from '@/hooks/useTestBundle';
import { ApiStatusError } from '@/lib/api/error';
import type { GenerateResult, TestBundleSummary } from '@/lib/api/test-bundle';
import { AnswerSourceForm } from './AnswerSourceForm';

type Runs = Pick<ReturnType<typeof useBundleRuns>, 'run' | 'pendingKey' | 'error'>;

interface Mismatch {
  input: string;
  expected: string;
  actual: string;
}

/** 409 "chưa có mã đáp án": lời từ chối duy nhất mà một form tải mã gỡ được. */
const needsAnswerSource = (error: Error | null) => error instanceof ApiStatusError && error.status === 409 && /mã đáp án/i.test(error.message);

const mismatchesOf = (error: Error | null): Mismatch[] => {
  const list = error instanceof ApiStatusError ? (error.body as { mismatches?: unknown } | undefined)?.mismatches : undefined;
  return Array.isArray(list) ? (list as Mismatch[]) : [];
};

const compileLogOf = (error: Error | null): string | null => {
  const log = error instanceof ApiStatusError ? (error.body as { compileLog?: unknown } | undefined)?.compileLog : undefined;
  return typeof log === 'string' && log !== '' ? log : null;
};

/**
 * Ba nút của khối Gói test (G2b-R): sinh đáp án mẫu và gói từ đề, sinh gói từ mã đáp án của giảng viên, chạy thử đáp án mẫu
 * với gói. Cả ba tốn thời gian và (hai nút đầu) tốn tiền, nên chỉ MỘT việc chạy tại một thời điểm và nút khoá từ đầu thay vì
 * để giảng viên đọc lời từ chối "đang chạy".
 *
 * Không nút nào duyệt hay ghim: gói sinh ra luôn chưa duyệt. Chạy thử nhắm vào gói đang ghim (đúng gói đang chấm bài), chưa
 * ghim thì phiên bản mới nhất, và câu bên dưới nói rõ phiên bản nào để không ai phải đoán.
 */
export function BundleActions({
  sessionId,
  bundles,
  pinnedBundleId,
  runs,
}: {
  sessionId: string;
  bundles: TestBundleSummary[];
  pinnedBundleId: string | null;
  runs: Runs;
}) {
  const generate = useGenerateTestBundle(sessionId);
  const [showSource, setShowSource] = useState(false);

  const pinned = bundles.find((b) => b.id === pinnedBundleId);
  const newest = bundles.reduce<TestBundleSummary | undefined>((best, b) => (best === undefined || b.version > best.version ? b : best), undefined);
  const runTarget = pinned ?? newest;
  const busy = generate.isPending || runs.pendingKey !== null;

  const error = generate.isError ? generate.error : runs.error;
  const result = generate.isSuccess ? (generate.data as GenerateResult | undefined) : undefined;
  const mismatches = mismatchesOf(error);
  const compileLog = compileLogOf(error);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => generate.mutate('statement')}>
          Sinh đáp án mẫu và gói test từ đề
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => generate.mutate('answer')}>
          Sinh gói test từ đáp án của bạn
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || runTarget === undefined}
          onClick={() => runTarget && runs.run(runTarget.id)}
        >
          Chạy thử đáp án mẫu với gói test
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-expanded={showSource} onClick={() => setShowSource((open) => !open)}>
          Tải mã đáp án (.cpp, .py)
        </Button>
      </div>

      <p className="text-caption text-muted-foreground">
        {runTarget === undefined
          ? 'Chưa có gói test để chạy thử.'
          : pinned
            ? `Chạy thử dùng phiên bản ${runTarget.version} (đang dùng để chấm).`
            : `Chạy thử dùng phiên bản ${runTarget.version} (mới nhất, chưa ghim).`}
      </p>

      {generate.isPending && (
        <p role="status" className="text-small text-muted-foreground">
          Đang sinh… hệ thống nhờ model viết rồi chạy đáp án hai lần trong máy chạy bài, có thể mất tới vài phút. Đừng đóng trang.
        </p>
      )}

      {result && (
        <Alert variant="success" role="status">
          <AlertDescription className="flex flex-col gap-1">
            <span>
              Đã sinh phiên bản {result.testBundle.version}: {result.testBundle.caseCount} ca
              {result.testBundle.droppedCount > 0 ? `, ${result.testBundle.droppedCount} ca bị bỏ (lý do ghi trong bảng ca)` : ''}. Gói
              chưa duyệt, chưa dùng để chấm.
            </span>
            {result.ruler?.trust === 'verified' && (
              <span>
                Đáp án do hệ thống viết đã chạy đúng {result.ruler.examplesChecked} ví dụ trong đề. Khớp ví dụ chưa chứng tỏ đúng với mọi
                đầu vào — hãy đọc kỹ các ca trước khi duyệt.
              </span>
            )}
            {result.ruler?.trust === 'unverified' && (
              <span>
                Đề không có ví dụ vào/ra nào để kiểm, nên đáp án do hệ thống viết CHƯA được kiểm chứng. Hãy đọc kỹ đáp án và các ca trước
                khi duyệt.
              </span>
            )}
            {result.warnings.length > 0 && (
              <ul className="list-disc pl-5">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-col gap-2">
            <span>{error.message}</span>
            {mismatches.length > 0 && (
              <ul className="flex flex-col gap-1">
                {mismatches.map((m, i) => (
                  <li key={i} className="font-mono text-caption">
                    Ví dụ {i + 1} — nhập: {JSON.stringify(m.input)} · Mong đợi: {JSON.stringify(m.expected)} · Nhận được: {JSON.stringify(m.actual)}
                  </li>
                ))}
              </ul>
            )}
            {compileLog && <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-caption">{compileLog}</pre>}
          </AlertDescription>
        </Alert>
      )}

      {(showSource || needsAnswerSource(error)) && <AnswerSourceForm sessionId={sessionId} />}
    </div>
  );
}
