import { useState } from 'react';
import { MgmtRolePick } from './MgmtRolePick';
import { TeacherLogin } from './TeacherLogin';
import { StudentLogin } from './StudentLogin';
import { TeacherHubView } from './TeacherHubView';
import { StudentNodeView } from './StudentNodeView';

type MgmtStep =
  | { kind: 'role' }
  | { kind: 'teacher_login' }
  | { kind: 'student_login' }
  | { kind: 'teacher_hub'; email: string }
  | { kind: 'student_node'; mssv: string; fullName: string };

export function MgmtApp({ onBackToLanding }: { onBackToLanding: () => void }) {
  const [step, setStep] = useState<MgmtStep>({ kind: 'role' });

  if (step.kind === 'role') {
    return (
      <MgmtRolePick
        onTeacher={() => setStep({ kind: 'teacher_login' })}
        onStudent={() => setStep({ kind: 'student_login' })}
        onBack={onBackToLanding}
      />
    );
  }
  if (step.kind === 'teacher_login') {
    return (
      <TeacherLogin
        onBack={() => setStep({ kind: 'role' })}
        onSuccess={(email) => setStep({ kind: 'teacher_hub', email })}
      />
    );
  }
  if (step.kind === 'student_login') {
    return (
      <StudentLogin
        onBack={() => setStep({ kind: 'role' })}
        onSuccess={({ mssv, fullName }) => setStep({ kind: 'student_node', mssv, fullName })}
      />
    );
  }
  if (step.kind === 'teacher_hub') {
    return (
      <TeacherHubView
        teacherEmail={step.email}
        onLeave={() => setStep({ kind: 'role' })}
      />
    );
  }
  return (
    <StudentNodeView
      mssv={step.mssv}
      fullName={step.fullName}
      onLeave={() => setStep({ kind: 'role' })}
    />
  );
}
