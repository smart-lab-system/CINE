import { useEffect, useState } from 'react';
import type { MgmtTodayExamItem } from '../../../../shared/ipc';
import { AppButton, BrandMark, Spinner, StatusLine } from '../ui';

export function TeacherExamPick({
  teacherEmail,
  onBack,
  onStarted,
}: {
  teacherEmail: string;
  onBack: () => void;
  onStarted: () => void;
}) {
  const [items, setItems] = useState<MgmtTodayExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await window.agent.mgmtListTodayExams();
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error ?? 'Không tải được kỳ thi.');
        return;
      }
      setItems(res.items ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (exam: MgmtTodayExamItem | null): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await window.agent.mgmtStartTeacherHub(
      exam
        ? {
            examSessionId: exam.id,
            courseId: exam.courseId,
            roomId: exam.roomId,
            examLabel: `${exam.name} · ${exam.courseName}`,
            examSessionCode: exam.code,
          }
        : {
            examSessionId: null,
            courseId: null,
            roomId: null,
            examLabel: null,
            examSessionCode: null,
          },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Không khởi động được Hub.');
      return;
    }
    onStarted();
  };

  if (loading || busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">
          {busy ? 'Đang kiểm tra máy giảng viên và khởi động Hub…' : 'Đang tải kỳ thi hôm nay…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Chọn kỳ thi hôm nay</h1>
      <p className="text-small text-muted-foreground">
        {teacherEmail} - chỉ hiện phiên có giờ bắt đầu trong ngày hôm nay (theo giờ Việt Nam).
      </p>
      {error && <StatusLine tone="danger">{error}</StatusLine>}

      {items.length === 0 ? (
        <p className="text-small text-muted-foreground">
          Không có kỳ thi nào bắt đầu hôm nay. Bạn vẫn có thể mở Hub lab thuần (không gắn phiên).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((exam) => (
            <li key={exam.id}>
              <button
                type="button"
                className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/60"
                onClick={() => void start(exam)}
              >
                <span className="block text-small font-semibold">{exam.name}</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {exam.courseName} · {exam.roomName || 'Chưa gắn phòng'} · {exam.status}
                </span>
                <span className="mt-0.5 block font-mono text-caption text-muted-foreground">
                  {exam.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <AppButton type="button" onClick={() => void start(null)}>
        Mở Hub lab (không gắn kỳ thi)
      </AppButton>
      <AppButton
        type="button"
        variant="ghost"
        onClick={() => {
          void window.agent.mgmtLeaveSession().then(onBack);
        }}
      >
        Quay lại
      </AppButton>
    </div>
  );
}
