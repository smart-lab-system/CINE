'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useExamMaterials } from '@/hooks/useExamSession';
import { useSetGradingReference } from '@/hooks/useGrading';
import { requestAnswerKeyUpload, type GradingReadiness, type GradingSourceInfo } from '@/lib/api/grading';
import { NO_QUESTION, buildReferencePayload, referenceIsDirty } from '@/lib/grading-reference-form';

/**
 * Tải đáp án mẫu thẳng lên kho — file KHÔNG đi qua API server (Security rule 5). Ném lỗi khi PUT hỏng và người
 * gọi phải DỪNG ở đó: lưu một tham chiếu trỏ tới object không tồn tại sẽ cho ra một phiên báo "mức 3" mà lúc
 * chấm tụt về mức 2 — chỉ một dòng log biết điều đó, và giảng viên thì không.
 */
async function uploadAnswerKey(sessionId: string, file: File): Promise<string> {
  const { storageKey, uploadUrl } = await requestAnswerKeyUpload(sessionId);
  const put = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!put.ok) throw new Error('Chưa tải được file đáp án lên kho lưu trữ. Thử lại giúp tôi.');
  return storageKey;
}

/**
 * Tài liệu chấm của phiên (spec §3.7): đề bài · đáp án mẫu · ghi chú — thay `GradingReferenceDialog`, giữ nguyên
 * luật ghi của nó: chỉ gửi trường đã đổi (không gửi = giữ, `null` = xoá, giá trị = đặt); đề bài KHÔNG chọn sẵn
 * file nào (Security rule 9); lên kho TRƯỚC rồi mới lưu tham chiếu.
 *
 * `onDirtyChange` báo còn thay đổi chưa lưu — màn cha không cho bắt đầu chấm lúc đó, vì bắt đầu chấm khoá tài liệu.
 * "Nguồn của từng tài liệu" (bạn tải lên lúc nào / gắn từ Soạn đề) đọc từ `readiness.sources`. Băng vàng "đáp án
 * chưa kiểm chứng" hiện cho tới khi thước được kiểm chứng (§6.3b). Ghim một gói KHÔNG làm thước thành đã kiểm
 * chứng: `hasPinnedBundle` chỉ đổi câu chữ, không tắt băng (G2b A2a).
 */
export function ReferenceForm({
  sessionId,
  readiness,
  onDirtyChange,
  hasPinnedBundle,
}: {
  sessionId: string;
  readiness: GradingReadiness | undefined;
  onDirtyChange: (dirty: boolean) => void;
  hasPinnedBundle: boolean;
}) {
  const materials = useExamMaterials(sessionId);
  const save = useSetGradingReference(sessionId);

  const [questionId, setQuestionId] = useState(NO_QUESTION);
  const [questionTouched, setQuestionTouched] = useState(false);
  const [note, setNote] = useState('');
  const [initialNote, setInitialNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const draft = { questionTouched, questionId, note, initialNote, storageKey: null, fileName: null };
  const dirty = referenceIsDirty(draft, file !== null);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const touch = () => setSaved(false);

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      // Thứ tự bắt buộc: lên kho TRƯỚC, lưu tham chiếu SAU.
      const storageKey = file ? await uploadAnswerKey(sessionId, file) : null;
      await save.mutateAsync(buildReferencePayload({ ...draft, storageKey, fileName: file?.name ?? null }));
      setQuestionTouched(false);
      setInitialNote(note);
      setFile(null);
      setFileKey((k) => k + 1);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lưu không thành công.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Tài liệu chấm" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-h3">Tài liệu chấm</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 flex flex-wrap items-center gap-2 text-small font-semibold">
          Đề bài
          {readiness?.hasQuestion && <Badge variant="accent">Đã chỉ định</Badge>}
        </legend>
        <p className="text-caption text-muted-foreground">
          Cho hệ thống biết bài hỏi gì, để chấm đúng ý và để góc kiểm đối chiếu được. Bạn chỉ định — hệ thống không tự
          đoán theo tên file.
        </p>
        {materials.isLoading && <p className="text-small text-muted-foreground">Đang tải danh sách tài liệu…</p>}
        {materials.data?.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-small text-muted-foreground">
            Phiên này chưa có tài liệu nào. Tải đề bài lên ở màn quản lý phiên thi trước.{' '}
            <Link href={`/exam-sessions/${sessionId}`} className="font-semibold underline underline-offset-2">
              Mở màn quản lý phiên thi
            </Link>
          </p>
        )}
        {materials.data?.map((material) => (
          <label
            key={material.id}
            className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-small hover:bg-surface-2"
          >
            <input
              type="radio"
              name="question-material"
              value={material.id}
              aria-label={material.fileName}
              checked={questionTouched && questionId === material.id}
              onChange={() => {
                touch();
                setQuestionTouched(true);
                setQuestionId(material.id);
              }}
            />
            <span className="truncate">{material.fileName}</span>
          </label>
        ))}
        {(materials.data?.length ?? 0) > 0 && (
          <label className="flex items-center gap-2.5 rounded-md px-3 py-2 text-small text-muted-foreground hover:bg-surface-2">
            <input
              type="radio"
              name="question-material"
              value={NO_QUESTION}
              aria-label="Không dùng đề bài"
              checked={questionTouched && questionId === NO_QUESTION}
              onChange={() => {
                touch();
                setQuestionTouched(true);
                setQuestionId(NO_QUESTION);
              }}
            />
            <span>Không dùng đề bài</span>
          </label>
        )}
        {readiness?.sources?.question.present && (
          <p className="text-caption text-muted-foreground">{sourceLine(readiness.sources.question)}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="answer-key-file">File đáp án mẫu (tuỳ chọn)</Label>
        <input
          key={fileKey}
          id="answer-key-file"
          type="file"
          className="text-small"
          onChange={(event) => {
            touch();
            setFile(event.target.files?.[0] ?? null);
          }}
        />
        <p className="text-caption text-muted-foreground">
          Đáp án mẫu <span className="font-semibold">không bao giờ hiển thị trên màn chấm</span> và không bao giờ được
          gửi cho mô hình dưới dạng đáp án — nó chỉ dùng để đối chiếu.
        </p>
        {readiness?.sources?.modelAnswer.present && readiness.sources.modelAnswer.unverified && (
          <Alert variant="warning" role="status">
            <AlertDescription>
              {hasPinnedBundle ? (
                <>
                  Đáp án mẫu này do hệ thống soạn đề sinh ra và <strong>chưa từng chạy thử</strong>. Phiên đã có gói
                  test ghim, nhưng thước vẫn chưa kiểm chứng: bài nào dựa vào nó sẽ về giảng viên, không tự quyết.
                </>
              ) : (
                <>
                  Đáp án mẫu này do hệ thống soạn đề sinh ra và <strong>chưa từng chạy thử</strong>. Cả phiên sẽ được đo
                  bằng một cái thước bạn chưa đọc — hãy kiểm tra đáp án và duyệt gói test ở khối bên dưới.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        {readiness?.sources?.modelAnswer.present && (
          <p className="text-caption text-muted-foreground">{sourceLine(readiness.sources.modelAnswer)}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="model-answer-note">Ghi chú đáp án</Label>
        <textarea
          id="model-answer-note"
          value={note}
          maxLength={4000}
          rows={4}
          placeholder="Ví dụ: chấp nhận Outbox hoặc event sourcing thay cho Saga, miễn là mô tả đúng cơ chế bù trừ."
          onChange={(event) => {
            touch();
            setNote(event.target.value);
          }}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
        />
        <p className="text-caption text-muted-foreground">
          Một câu cũng đủ: chấp nhận cách giải nào, bỏ qua lỗi nào. Không bắt buộc phải có file.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert variant="success" role="status">
          <AlertDescription>Đã lưu tài liệu chấm.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          Bỏ trống một mục nghĩa là giữ nguyên lựa chọn hiện tại.
        </p>
        <Button type="button" disabled={!dirty} loading={busy} onClick={handleSave}>
          Lưu tài liệu chấm
        </Button>
      </div>
    </section>
  );
}

/** Một câu nguồn: ai đưa tài liệu và lúc nào. Một câu ghi chú không được gọi là "tải lên". */
function sourceLine(source: GradingSourceInfo): string {
  const when = source.setAt ? new Date(source.setAt).toLocaleString('vi-VN') : 'thời điểm không ghi nhận';
  const named = source.fileName ? ` (${source.fileName})` : '';
  if (source.kind === 'authoring') return `Nguồn: gắn từ Soạn đề lúc ${when}${named}.`;
  return source.fileName ? `Nguồn: bạn tải lên lúc ${when}${named}.` : `Nguồn: bạn ghi chú lúc ${when}.`;
}
