import { useEffect, useState } from 'react';
import { TeacherLogin } from './TeacherLogin';
import { TeacherExamPick } from './TeacherExamPick';
import { StudentLogin } from './StudentLogin';
import { TeacherHubView } from './TeacherHubView';
import { StudentNodeView } from './StudentNodeView';
import { AppButton, BrandMark, Spinner, StatusLine } from '../ui';

type MgmtStep =
  | { kind: 'resolving' }
  | { kind: 'unknown'; error: string }
  | { kind: 'teacher_login' }
  | { kind: 'teacher_pick_exam'; email: string }
  | { kind: 'student_login' }
  | { kind: 'teacher_hub'; email: string }
  | { kind: 'student_node'; mssv: string; fullName: string };

export function MgmtApp({ onBackToLanding }: { onBackToLanding: () => void }) {
  const [step, setStep] = useState<MgmtStep>({ kind: 'resolving' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await window.agent.mgmtResolveMachineRole();
      if (cancelled) return;
      if (!res.ok) {
        setStep({
          kind: 'unknown',
          error: res.error ?? 'Không xác định được loại máy.',
        });
        return;
      }
      if (res.role === 'teacher') {
        setStep({ kind: 'teacher_login' });
        return;
      }
      if (res.role === 'student') {
        setStep({ kind: 'student_login' });
        return;
      }
      setStep({
        kind: 'unknown',
        error:
          res.fromCache
            ? (res.error ?? 'Không đọc được vai trò máy đã lưu.')
            : 'Máy này chưa có trong danh mục phòng máy. Admin cần thêm máy vào phòng trước khi dùng Quản lý.',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (step.kind === 'resolving') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">Đang nhận diện máy…</p>
      </div>
    );
  }

  if (step.kind === 'unknown') {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <BrandMark />
        <h1 className="-mb-1 text-h2 font-bold">Quản lý</h1>
        <StatusLine tone="danger">{step.error}</StatusLine>
        <AppButton type="button" variant="ghost" onClick={onBackToLanding}>
          Quay lại
        </AppButton>
      </div>
    );
  }

  if (step.kind === 'teacher_login') {
    return (
      <TeacherLogin
        onBack={onBackToLanding}
        onSuccess={(email) => setStep({ kind: 'teacher_pick_exam', email })}
      />
    );
  }
  if (step.kind === 'teacher_pick_exam') {
    return (
      <TeacherExamPick
        teacherEmail={step.email}
        onBack={onBackToLanding}
        onStarted={() => setStep({ kind: 'teacher_hub', email: step.email })}
      />
    );
  }
  if (step.kind === 'student_login') {
    return (
      <StudentLogin
        onBack={onBackToLanding}
        onSuccess={({ mssv, fullName }) => setStep({ kind: 'student_node', mssv, fullName })}
      />
    );
  }
  if (step.kind === 'teacher_hub') {
    return (
      <TeacherHubView
        teacherEmail={step.email}
        onLeave={onBackToLanding}
      />
    );
  }
  return (
    <StudentNodeView
      mssv={step.mssv}
      fullName={step.fullName}
      onLeave={onBackToLanding}
    />
  );
}
