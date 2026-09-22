'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useGenerateExam } from '@/hooks/useExamAuthoring';
import { clearDraft, loadDraft, saveDraft } from '@/lib/exam-draft';
import {
  AUTHORING_LANGUAGES,
  downloadAnswerKey,
  downloadExamPaper,
  type AuthoringLanguage,
  type GeneratedExam,
  type GeneratedQuestion,
} from '@/lib/api/exam-authoring';
import { QuestionCard } from './_components/question-card';
import { SessionPicker } from './_components/session-picker';
import { UnverifiedWarning } from './_components/unverified-warning';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useExamSessions } from '@/hooks/useExamSession';
import { attachExamToSession } from '@/lib/api/exam-authoring';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';

const MAX_QUESTIONS = 10;

/**
 * Soạn đề bằng AI.
 *
 * Không có bảng nào lưu đề (spec soạn đề §9): bản nháp sống trong
 * `localStorage` và tự xoá sau 24 giờ. Mọi thứ trên màn hình này là state của
 * trang cộng một bản sao trong trình duyệt.
 */
export default function ExamAuthoringPage() {
  const [prompt, setPrompt] = useState('');
  const [questionCount, setQuestionCount] = useState(3);
  const [language, setLanguage] = useState<AuthoringLanguage>('python');
  const [exam, setExam] = useState<GeneratedExam | null>(null);
  /** Câu đang được sinh lại. `null` = đang sinh cả đề, hoặc không sinh gì. */
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const generate = useGenerateExam();
  const router = useRouter();

  /** `'pick'` = chọn phiên, `'warn'` = xác nhận chuẩn chưa kiểm chứng. */
  const [attachStep, setAttachStep] = useState<'pick' | 'warn' | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Chỉ tải danh sách phiên khi hộp thoại mở: trang soạn đề không cần nó để
  // làm việc chính, và một request thừa mỗi lần vào trang là một request thừa.
  const sessions = useExamSessions({ page: 1, pageSize: 50 });
  const picked = sessions.data?.items.find((s) => s.id === pickedId) ?? null;

  // Đọc nháp SAU khi mount, không phải lúc khởi tạo state: server không có
  // `localStorage`, nên đọc lúc khởi tạo cho ra hai kết quả khác nhau giữa
  // server và client và React báo hydration mismatch.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setExam(draft);
    }
  }, []);

  function updateExam(next: GeneratedExam) {
    setExam(next);
    saveDraft(next);
  }

  function handleGenerate() {
    setRegeneratingIndex(null);
    generate.mutate(
      { prompt, questionCount, language },
      {
        onSuccess: (result) => updateExam(result),
        onError: (e) => toast.error(e.message || 'Không sinh được đề. Hãy thử lại.'),
      },
    );
  }

  /**
   * Sinh lại MỘT câu, giữ nguyên các câu khác.
   *
   * Ba thứ đi kèm, và thiếu vế nào cũng hỏng: `avoid` (bài model vừa tự khai —
   * hệ thống tự điền, giảng viên không phải gõ lại), `refineNote` (hướng đi
   * mới, thứ duy nhất hệ thống không đoán được), và `existingStatements` (đề
   * các câu đang giữ, để câu mới không trùng ý).
   */
  function handleRegenerate(index: number, note: string) {
    if (!exam) return;
    const target = exam.questions[index];
    setRegeneratingIndex(index);
    generate.mutate(
      {
        prompt,
        questionCount: 1,
        language,
        avoid: target.resemblesKnownProblem ? [target.resemblesKnownProblem] : undefined,
        refineNote: note,
        existingStatements: exam.questions
          .filter((_, i) => i !== index)
          .map((q) => q.statement),
      },
      {
        onSuccess: (result) => {
          const replacement = result.questions[0];
          if (!replacement) {
            toast.error('Model không trả về câu nào. Hãy thử lại.');
            return;
          }
          const questions = exam.questions.map((q, i) =>
            i === index ? { ...replacement, points: q.points } : q,
          );
          updateExam({ ...exam, questions });
          toast.success(`Đã sinh lại câu ${index + 1}.`);
        },
        onError: (e) => toast.error(e.message || 'Không sinh lại được câu này.'),
        onSettled: () => setRegeneratingIndex(null),
      },
    );
  }

  function handleQuestionChange(index: number, next: GeneratedQuestion) {
    if (!exam) return;
    updateExam({
      ...exam,
      questions: exam.questions.map((q, i) => (i === index ? next : q)),
    });
  }

  async function handleExport(kind: 'paper' | 'key') {
    if (!exam) return;
    try {
      await (kind === 'paper' ? downloadExamPaper(exam) : downloadAnswerKey(exam));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xuất được file.');
    }
  }

  async function handleAttach() {
    if (!exam || !picked) return;
    setAttaching(true);
    try {
      await attachExamToSession(picked.id, exam);
      setAttachStep(null);
      toast.success('Đã gắn đề và đáp án vào phiên thi.');
      // Sang phòng chờ để giảng viên kiểm lại tài liệu — việc gắn chỉ coi là
      // xong khi họ xác nhận ở đó.
      router.push(`/exam-sessions/${picked.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không gắn được vào phiên thi.');
    } finally {
      setAttaching(false);
    }
  }

  function handleClearDraft() {
    clearDraft();
    setExam(null);
    toast.success('Đã xoá bản nháp khỏi máy này.');
  }

  const busy = generate.isPending;
  const generatingWholeExam = busy && regeneratingIndex === null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Soạn đề bằng AI"
        description="Agent sinh đề, đáp án mẫu và gói test cho môn Cấu trúc dữ liệu & Giải thuật. Bạn sửa được mọi ô trước khi xuất."
        actions={
          <span className="text-small text-muted-foreground">Bản nháp tự xoá sau 24 giờ</span>
        }
      />
      <ExamForm
        prompt={prompt}
        questionCount={questionCount}
        language={language}
        busy={busy}
        hasExam={exam !== null}
        onPrompt={setPrompt}
        onQuestionCount={setQuestionCount}
        onLanguage={setLanguage}
        onSubmit={handleGenerate}
      />
      {generatingWholeExam && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      )}
      {exam && !generatingWholeExam && (
        <div data-animate className="flex flex-col gap-4">
          <UnverifiedBanner />
          {exam.questions.map((q, i) => (
            <QuestionCard
              key={`${i}-${q.topic}`}
              index={i}
              question={q}
              regenerating={regeneratingIndex === i}
              onChange={(next) => handleQuestionChange(i, next)}
              onRegenerate={(note) => handleRegenerate(i, note)}
            />
          ))}
          <ActionBar
            onExportPaper={() => handleExport('paper')}
            onExportKey={() => handleExport('key')}
            onAttach={() => {
              setPickedId(null);
              setAttachStep('pick');
            }}
            onClearDraft={handleClearDraft}
          />
        </div>
      )}

      <Dialog
        open={attachStep !== null}
        onOpenChange={(open) => !open && setAttachStep(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {attachStep === 'warn' ? 'Xác nhận gắn vào phiên thi' : 'Gắn vào phiên thi nào?'}
            </DialogTitle>
          </DialogHeader>
          {attachStep === 'pick' && (
            <SessionPicker
              sessions={sessions.data?.items ?? []}
              selectedId={pickedId}
              onSelect={setPickedId}
              onCancel={() => setAttachStep(null)}
              onConfirm={() => setAttachStep('warn')}
            />
          )}
          {attachStep === 'warn' && picked && (
            <UnverifiedWarning
              session={picked}
              pending={attaching}
              onCancel={() => setAttachStep('pick')}
              onProceed={handleAttach}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExamForm({
  prompt,
  questionCount,
  language,
  busy,
  hasExam,
  onPrompt,
  onQuestionCount,
  onLanguage,
  onSubmit,
}: {
  prompt: string;
  questionCount: number;
  language: AuthoringLanguage;
  busy: boolean;
  hasExam: boolean;
  onPrompt: (v: string) => void;
  onQuestionCount: (v: number) => void;
  onLanguage: (v: AuthoringLanguage) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <label htmlFor="prompt" className="mb-1.5 block text-small font-semibold">
            Yêu cầu của bạn
          </label>
          <textarea
            id="prompt"
            rows={3}
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder="Ví dụ: hai câu về cây nhị phân tìm kiếm, mức cuối kỳ, một câu phải đạt O(log n), cấm dùng thư viện có sẵn."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-small leading-relaxed text-foreground"
          />
          <p className="mt-1.5 text-caption text-muted-foreground">
            Càng nói rõ ràng buộc (cấm thư viện nào, đạt độ phức tạp nào) thì đề sinh ra càng
            sát ý bạn. Agent cũng đọc rubric của chính bạn để biết bạn tính điểm cho cái gì.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <label htmlFor="so-cau" className="mb-1.5 block text-small font-semibold">
              Số câu
            </label>
            <input
              id="so-cau"
              type="number"
              min={1}
              max={MAX_QUESTIONS}
              value={questionCount}
              onChange={(e) => onQuestionCount(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-small"
            />
          </div>
          <div className="w-40">
            <label htmlFor="ngon-ngu" className="mb-1.5 block text-small font-semibold">
              Ngôn ngữ
            </label>
            <select
              id="ngon-ngu"
              value={language}
              onChange={(e) => onLanguage(e.target.value as AuthoringLanguage)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-small"
            >
              {AUTHORING_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-grow" />
          <Button
            type="button"
            onClick={onSubmit}
            disabled={busy || prompt.trim().length < 10}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {hasExam ? 'Sinh lại cả đề' : 'Sinh đề'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Băng CHƯA KIỂM CHỨNG — KHÔNG có nút đóng, cố ý.
 *
 * Một cảnh báo tắt được là một cảnh báo sẽ bị tắt, và bên dưới nó là đáp án
 * chưa ai chạy. Nó biến mất khi và chỉ khi sandbox thật sự kiểm chứng xong
 * (spec soạn đề §4).
 */
function UnverifiedBanner() {
  return (
    <Alert role="status" aria-label="Chưa kiểm chứng" variant="warning">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertDescription>
        <span className="font-bold">
          CHƯA KIỂM CHỨNG — đáp án mẫu chưa được chạy lần nào.
        </span>{' '}
        Sandbox chưa có, nên hệ thống không biết mã dưới đây có biên dịch được không, có qua
        được chính gói test của nó không, hay độ phức tạp thật có khớp con số đã ghi không.
        Hãy tự đọc lại trước khi dùng.
      </AlertDescription>
    </Alert>
  );
}

function ActionBar({
  onExportPaper,
  onExportKey,
  onAttach,
  onClearDraft,
}: {
  onExportPaper: () => void;
  onExportKey: () => void;
  onAttach: () => void;
  onClearDraft: () => void;
}) {
  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2.5 p-4">
          <Button type="button" onClick={onExportPaper}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất đề (Word)
          </Button>
          <Button type="button" variant="outline" onClick={onExportKey}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất đáp án + test (Word)
          </Button>
          <Button type="button" variant="outline" onClick={onAttach}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Gắn vào phiên thi
          </Button>
          <div className="flex-grow" />
          <Button type="button" variant="outline" onClick={onClearDraft}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xoá bản nháp
          </Button>
        </CardContent>
      </Card>
      <p className="text-caption leading-relaxed text-muted-foreground">
        Đề và đáp án là <strong className="text-foreground">hai file riêng</strong>, cố ý —
        một file Word chứa cả hai là cách đáp án đi nhầm vào tài liệu phát cho sinh viên.
        Bản nháp chỉ nằm trên máy này, không lưu lên máy chủ.
      </p>
    </>
  );
}
