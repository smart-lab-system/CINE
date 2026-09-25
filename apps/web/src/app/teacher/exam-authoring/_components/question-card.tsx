'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GeneratedQuestion } from '@/lib/api/exam-authoring';

const QUICK_NOTES = [
  'Đổi ràng buộc đầu ra',
  'Nâng độ khó',
  'Thêm yêu cầu độ phức tạp',
  'Đổi sang chủ đề khác',
];

/**
 * Một câu trong đề, sửa được tại chỗ và gập được.
 *
 * Gập KHÔNG được giấu cảnh báo: khi thẻ đóng lại, chip "Cần bạn quyết" vẫn ở
 * nguyên dải đầu. Nếu không, "đọc xong rồi gập" trở thành cách bỏ qua đúng thứ
 * đang cần giảng viên quyết.
 */
export function QuestionCard({
  index,
  question,
  onChange,
  onRegenerate,
  regenerating,
}: {
  index: number;
  question: GeneratedQuestion;
  onChange: (next: GeneratedQuestion) => void;
  onRegenerate: (note: string) => void;
  regenerating: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [regenOpen, setRegenOpen] = useState(false);
  const [note, setNote] = useState('');

  const number = index + 1;
  const isClassic = question.resemblesKnownProblem !== null;

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface',
        isClassic ? 'border-warning/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-body font-bold">Câu {number}</span>
        <Badge variant="default">{question.points} điểm</Badge>
        {/*
         * Lỗi thật 2026-09-24: `topic`/`requiredComplexity` là văn bản TỰ DO
         * của model, không giới hạn độ dài ở đâu cả — model đã thật sự viết
         * cả một câu vào đây (vd "O(M*N log(M*N)) thời gian, O(M*N) bộ nhớ;
         * cấm đệ quy..."). `Badge` không tự cắt, nên dải tiêu đề GẬP LẠI
         * phình gần bằng lúc MỞ RA — gập "không có tác dụng gì".
         *
         * Cắt bằng CSS (`max-w` + `truncate`) CHỈ khi gập (`!open`), giống
         * hệt cách `statement` xem trước đã làm bên dưới — mở ra thì vẫn cần
         * đọc trọn, vì đó đúng lúc giảng viên đang xem chi tiết. `title` giữ
         * nguyên văn để hiện khi di chuột — cắt hình chứ không cắt chữ.
         */}
        <Badge
          variant="info"
          className={cn(!open && 'max-w-[180px] truncate')}
          title={!open ? question.topic : undefined}
        >
          {question.topic}
        </Badge>
        {question.requiredComplexity ? (
          <Badge
            variant="success"
            className={cn(!open && 'max-w-[220px] truncate')}
            title={!open ? question.requiredComplexity : undefined}
          >
            {question.requiredComplexity}
          </Badge>
        ) : (
          <Badge variant="default">không ràng buộc độ phức tạp</Badge>
        )}
        {/* Chip này sống sót qua lượt gập — xem doc của component. */}
        {isClassic && (
          <Badge variant="warning">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Cần bạn quyết
          </Badge>
        )}
        {!open && (
          <span className="max-w-[420px] truncate text-small text-muted-foreground">
            {question.statement}
          </span>
        )}
        <div className="flex-grow" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`cau-${number}-noi-dung`}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-small font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? 'Gập lại' : 'Mở ra'} câu {number}
          {open ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div id={`cau-${number}-noi-dung`} hidden={!open} className="flex flex-col gap-3 px-4 pb-4">
        <div>
          <label
            htmlFor={`de-${number}`}
            className="mb-1.5 block text-small font-semibold text-foreground"
          >
            Đề bài câu {number}
          </label>
          <AutoTextarea
            id={`de-${number}`}
            rows={3}
            value={question.statement}
            onChange={(e) => onChange({ ...question, statement: e.target.value })}
          />
        </div>

        <div>
          <label
            htmlFor={`dapan-${number}`}
            className="mb-1.5 block text-small font-semibold text-foreground"
          >
            Đáp án mẫu câu {number} (mã nguồn)
          </label>
          <AutoTextarea
            id={`dapan-${number}`}
            rows={8}
            value={question.modelAnswer}
            onChange={(e) => onChange({ ...question, modelAnswer: e.target.value })}
            className="bg-surface-2 font-mono text-caption"
          />
        </div>

        {question.testBundle.length > 0 && (
          <div>
            <p className="mb-1.5 text-caption font-semibold text-muted-foreground">
              Gói test ({question.testBundle.length} ca)
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-caption">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">Nhóm</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">Vào</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">Ra</th>
                  </tr>
                </thead>
                <tbody>
                  {question.testBundle.map((c) => (
                    <tr key={`${c.group}-${c.name}`} className="border-t border-border">
                      <td className="px-2.5 py-1.5">{c.group}</td>
                      <td className="px-2.5 py-1.5 font-mono">{c.input}</td>
                      <td className="px-2.5 py-1.5 font-mono">{c.expectedOutput}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/*
         * Yêu cầu 2026-09-25: một câu KHÔNG bị gắn cờ vẫn cần lối sinh lại —
         * model ra tốt không có nghĩa giảng viên không muốn đổi test case
         * hoặc nâng độ khó. Trước đây `{isClassic && ...}` bỏ hẳn nhánh còn
         * lại: câu tốt không có cách nào sinh lại RIÊNG nó, chỉ còn "Sinh
         * lại cả đề" — mất luôn mọi câu khác đang giữ.
         */}
        {isClassic ? (
          <ClassicProblemPanel
            number={number}
            problem={question.resemblesKnownProblem!}
            open={regenOpen}
            note={note}
            regenerating={regenerating}
            onOpen={() => setRegenOpen(true)}
            onClose={() => setRegenOpen(false)}
            onNote={setNote}
            onSubmit={() => onRegenerate(note)}
          />
        ) : (
          <RegenerateQuestionPanel
            number={number}
            open={regenOpen}
            note={note}
            regenerating={regenerating}
            onOpen={() => setRegenOpen(true)}
            onClose={() => setRegenOpen(false)}
            onNote={setNote}
            onSubmit={() => onRegenerate(note)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Hộp "câu này là bài kinh điển" — và ba việc giảng viên làm được với nó.
 *
 * Bản đầu của hộp này chỉ nêu sự thật rồi dừng. Một cảnh báo không kèm việc
 * phải làm là nhiễu, và nhiễu thì bị bỏ qua từ lần thứ ba trở đi.
 */
function ClassicProblemPanel({
  number,
  problem,
  open,
  note,
  regenerating,
  onOpen,
  onClose,
  onNote,
  onSubmit,
}: {
  number: number;
  problem: string;
  open: boolean;
  note: string;
  regenerating: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNote: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3.5">
      <div className="flex items-start gap-2.5">
        <Search className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
        <div className="text-small leading-relaxed text-foreground">
          <p className="font-bold text-warning-strong">
            Câu này gần như là bài kinh điển &ldquo;{problem}&rdquo;
          </p>
          <p className="mt-1">
            <strong>Hệ quả 1 —</strong> phòng thi không chặn Internet, nên sinh viên tra ra
            lời giải đầy đủ rất nhanh. Câu này sẽ đo khả năng tìm kiếm chứ không đo hiểu
            biết.
          </p>
          <p className="mt-1">
            <strong>Hệ quả 2 —</strong> khi chấm, nhiều bài sẽ giống hệt nhau vì cùng chép
            một nguồn, và phép so sánh chéo giữa các bài sẽ báo nghi vấn chép bài hàng loạt
            mà không ai thật sự chép của ai.
          </p>
          <p className="mt-1.5 italic text-muted-foreground">
            Đây là lời tự khai của chính model đã sinh ra câu hỏi — hệ thống không có mạng
            để đối chiếu, nên nó không phát hiện được bài kinh điển mà model không tự nhận.
          </p>
        </div>
      </div>

      {!open ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warning/40 pt-3">
          <Button type="button" size="sm" onClick={onOpen} className='text-white'>
            <RefreshCw className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            Sinh lại riêng câu này
          </Button>
          <span className="text-caption text-muted-foreground">
            hoặc sửa tay ô đề ở trên, hoặc giữ nguyên nếu đề này ra mức cơ bản.
          </span>
        </div>
      ) : (
        <RegenerateForm
          number={number}
          problem={problem}
          note={note}
          regenerating={regenerating}
          tone="warning"
          onNote={onNote}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </div>
  );
}

/**
 * Lối vào sinh lại cho câu KHÔNG bị gắn cờ trùng bài kinh điển.
 *
 * Yêu cầu 2026-09-25: model ra một câu tốt không có nghĩa giảng viên không
 * muốn đổi gì — vẫn có thể muốn test case khác, hoặc nâng độ khó. Nhẹ hơn
 * `ClassicProblemPanel` CÓ CHỦ Ý: không có rủi ro nào để báo ở đây, nên
 * không phải một hộp cảnh báo, chỉ là một lối tắt — một dòng chữ, không màu
 * cảnh báo, không đoạn giải thích "Hệ quả".
 */
function RegenerateQuestionPanel({
  number,
  open,
  note,
  regenerating,
  onOpen,
  onClose,
  onNote,
  onSubmit,
}: {
  number: number;
  open: boolean;
  note: string;
  regenerating: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNote: (v: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex w-fit items-center gap-1.5 text-caption font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Sinh lại câu này
      </button>
    );
  }
  return (
    <RegenerateForm
      number={number}
      problem={null}
      note={note}
      regenerating={regenerating}
      onNote={onNote}
      onSubmit={onSubmit}
      onCancel={onClose}
    />
  );
}

/**
 * Form ghi chú + gợi ý nhanh + nút gửi — DÙNG CHUNG giữa hai lối vào sinh
 * lại (`ClassicProblemPanel` và `RegenerateQuestionPanel`).
 *
 * `problem`: bài kinh điển phải tránh, hoặc `null` khi không phải lượt tránh
 * bài kinh điển — dòng "Không được ra lại bài X" trong hộp tự thêm chỉ hiện
 * khi có `problem`, vì không có gì để tránh thì không có gì để nói.
 *
 * `tone`: chỉ đổi MÀU (viền/chữ cảnh báo hay trung tính) để khớp bối cảnh
 * bao quanh — `ClassicProblemPanel` nằm trong hộp cảnh báo nên giữ tông màu
 * đó xuyên suốt; `RegenerateQuestionPanel` không có gì để cảnh báo. Luật
 * khoá nút gửi tới khi có ghi chú là MỘT, không đổi theo `tone`: sinh lại mà
 * không nói đổi gì thì model rơi lại đúng chỗ cũ — nó chọn bài kinh điển vì
 * đó là chỗ trũng nhất của phân phối, và prompt không đổi thì phân phối
 * không đổi. Lý do này không riêng gì bài kinh điển, nên luật áp cho cả hai.
 */
function RegenerateForm({
  number,
  problem,
  note,
  regenerating,
  tone = 'neutral',
  onNote,
  onSubmit,
  onCancel,
}: {
  number: number;
  problem: string | null;
  note: string;
  regenerating: boolean;
  tone?: 'warning' | 'neutral';
  onNote: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isWarning = tone === 'warning';
  return (
    <div className={cn('mt-3 border-t pt-3', isWarning ? 'border-warning/40' : 'border-border')}>
      <label
        htmlFor={`ghichu-${number}`}
        className={cn(
          'mb-1.5 block text-small font-semibold',
          isWarning ? 'text-warning-strong' : 'text-foreground',
        )}
      >
        Cần đổi gì ở câu {number}?
      </label>
      <AutoTextarea
        id={`ghichu-${number}`}
        rows={2}
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Ví dụ: đổi sang yêu cầu đếm số lần so sánh, và cho mảng xoay vòng."
        className={isWarning ? 'border-warning/40' : undefined}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption font-semibold text-muted-foreground">Gợi ý nhanh:</span>
        {QUICK_NOTES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onNote(note ? `${note}; ${q.toLowerCase()}` : q)}
            className={cn(
              'rounded-full border bg-surface px-2.5 py-0.5 text-caption font-semibold transition-colors',
              isWarning
                ? 'border-warning/40 text-warning-strong hover:bg-warning-subtle'
                : 'border-border text-muted-foreground hover:bg-surface-2',
            )}
          >
            {q}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'mt-2.5 rounded-lg border border-dashed bg-surface/60 p-2.5 text-caption leading-relaxed text-muted-foreground',
          isWarning ? 'border-warning/40' : 'border-border',
        )}
      >
        Hệ thống tự thêm vào yêu cầu, bạn không phải gõ lại:
        {problem && (
          <span className="mt-0.5 block">
            &bull; <em>&ldquo;Không được ra lại bài {problem}.&rdquo;</em>
          </span>
        )}
        <span className="block">
          &bull; Đề của các câu đang giữ, để câu mới không trùng ý với chúng.
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={note.trim().length === 0 || regenerating}
          onClick={onSubmit}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')}
            aria-hidden="true"
          />
          Sinh lại câu {number}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Huỷ
        </Button>
        {note.trim().length === 0 && (
          <span className="text-caption text-muted-foreground">
            Nói rõ cần đổi gì, nếu không model sẽ ra lại đúng loại đề này.
          </span>
        )}
      </div>
    </div>
  );
}
