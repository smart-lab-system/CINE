'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { requestAnswerKeyUpload, type GradingReadiness, type GradingReferenceInput } from '@/lib/api/grading';
import { useExamMaterials } from '@/hooks/useExamSession';
import { useSetGradingReference } from '@/hooks/useGrading';

const NO_QUESTION = '';

/**
 * Tải đáp án mẫu thẳng lên kho.
 *
 * File KHÔNG đi qua API server (Security rule 5). Ném lỗi khi PUT hỏng, và
 * người gọi phải DỪNG ở đó: lưu một tham chiếu trỏ tới object không tồn tại
 * sẽ cho ra một phiên báo "Mức 3" mà lúc chấm lại tụt về Mức 2 — chỉ một
 * dòng log biết điều đó, và giảng viên thì không.
 */
async function uploadAnswerKey(examSessionId: string, file: File): Promise<string> {
  const { storageKey, uploadUrl } = await requestAnswerKeyUpload(examSessionId);
  const put = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!put.ok) {
    throw new Error('Chưa tải được file đáp án lên kho lưu trữ. Thử lại giúp tôi.');
  }
  return storageKey;
}

/**
 * Chỉ định đề bài và đáp án cho một phiên.
 *
 * Đây là đường DUY NHẤT ghi được `grading_reference`, và vì thế là thứ biến
 * lượt phản biện từ code chết thành code chạy: nó chỉ chạy khi phiên có đề
 * bài.
 */
export function GradingReferenceDialog({
  examSessionId,
  open,
  onOpenChange,
  readiness,
}: {
  examSessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readiness: GradingReadiness;
}) {
  // Qua hook, không gọi thẳng `listExamMaterials` — quy tắc frontend #1 của
  // CLAUDE.md. Hệ quả thực tế: test mock được đúng một module hooks thay vì
  // phải dựng một QueryClientProvider cho mỗi component.
  const materials = useExamMaterials(examSessionId);
  const save = useSetGradingReference(examSessionId);

  // KHÔNG chọn sẵn file nào, kể cả khi tên trông hiển nhiên là đề bài.
  // Security rule 9: đoán sai một lần là cả lượt chấm đọc nhầm tài liệu mà
  // không ai biết.
  const [questionId, setQuestionId] = useState<string>(NO_QUESTION);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Giá trị ban đầu, để biết trường nào THẬT SỰ đổi.
  const [initial] = useState({ questionId: NO_QUESTION, note: '' });

  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  /**
   * CHỈ gửi trường đã đổi.
   *
   * DTO phía server phân biệt ba trạng thái: không gửi = GIỮ NGUYÊN, gửi
   * `null` = XOÁ, gửi giá trị = ĐẶT. Gửi cả object mỗi lần sẽ gỡ mất lựa
   * chọn đề bài ngay khi giảng viên chỉ định sửa mỗi dòng ghi chú — và họ
   * không thấy gì bất thường cho tới lượt chấm sau.
   */
  function buildPayload(answerKey: string | null): GradingReferenceInput {
    const body: GradingReferenceInput = {};
    if (questionId !== initial.questionId) {
      body.questionMaterialId = questionId === NO_QUESTION ? null : questionId;
    }
    if (note !== initial.note) {
      body.modelAnswerNote = note.trim() === '' ? null : note.trim();
    }
    if (answerKey && file) {
      body.modelAnswerStorageKey = answerKey;
      body.modelAnswerFilename = file.name;
    }
    return body;
  }

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      // Thứ tự bắt buộc: lên kho TRƯỚC, lưu tham chiếu SAU.
      const answerKey = file ? await uploadAnswerKey(examSessionId, file) : null;
      await save.mutateAsync(buildPayload(answerKey));
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lưu không thành công.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cấu hình đề bài &amp; đáp án</DialogTitle>
          <DialogDescription>
            Càng nhiều ngữ cảnh, lượt chấm càng hiểu đúng bài của sinh viên. Đề bài là thứ
            bật được lượt phản biện.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="section-label mb-1.5">Mức 2 — File nào là đề bài</legend>
            {materials.isLoading && (
              <p className="text-small text-muted-foreground">Đang tải danh sách tài liệu…</p>
            )}
            {materials.data?.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-small text-muted-foreground">
                Phiên này chưa có tài liệu nào. Tải đề bài lên ở màn quản lý phiên thi trước.
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
                  checked={questionId === material.id}
                  onChange={() => setQuestionId(material.id)}
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
                  checked={questionId === NO_QUESTION && initial.questionId !== NO_QUESTION}
                  onChange={() => setQuestionId(NO_QUESTION)}
                />
                <span>Không dùng đề bài</span>
              </label>
            )}
            <p className="text-caption text-muted-foreground">
              Bạn chỉ định — hệ thống không tự đoán theo tên file.
            </p>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="model-answer-note">Mức 3 — Ghi chú đáp án</Label>
            <textarea
              id="model-answer-note"
              value={note}
              maxLength={4000}
              rows={4}
              placeholder="Ví dụ: chấp nhận Outbox hoặc event sourcing thay cho Saga, miễn là mô tả đúng cơ chế bù trừ."
              onChange={(event) => setNote(event.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
            />
            <p className="text-caption text-muted-foreground">
              Một câu cũng đủ để lên mức 3 — không bắt buộc phải có file.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="answer-key-file">File đáp án mẫu (tuỳ chọn)</Label>
            <input
              id="answer-key-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-small"
            />
            <p className="text-caption text-muted-foreground">
              Đáp án mẫu <span className="font-semibold">không bao giờ hiển thị trên màn chấm</span>{' '}
              và không bao giờ được gửi cho AI dưới dạng đáp án — nó chỉ dùng để đối chiếu.
            </p>
          </div>

          {readiness.hasQuestion && (
            <p className="text-caption text-muted-foreground">
              Phiên đang ở mức {readiness.hasModelAnswer ? 3 : 2}. Bỏ trống một mục nghĩa là giữ
              nguyên lựa chọn hiện tại.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button onClick={handleSave} loading={busy}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
