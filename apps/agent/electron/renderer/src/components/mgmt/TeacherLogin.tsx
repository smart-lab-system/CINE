import { useState, type FormEvent } from 'react';
import { AppButton, BrandMark, Field, Spinner, StatusLine } from '../ui';

export function TeacherLogin({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Nhập đầy đủ email và mật khẩu.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.agent.mgmtLoginTeacher({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Đăng nhập thất bại.');
      return;
    }
    onSuccess(result.email ?? email.trim());
  };

  if (busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">Đang đăng nhập và khởi động Hub…</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Giảng viên</h1>
      <p className="text-small text-muted-foreground">
        Đăng nhập tài khoản hệ thống. Máy này sẽ thành Teacher Hub trên LAN phòng lab.
      </p>
      <Field
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Field
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <StatusLine tone="danger">{error}</StatusLine>}
      <AppButton type="submit">Đăng nhập</AppButton>
      <AppButton type="button" variant="ghost" onClick={onBack}>
        Quay lại
      </AppButton>
    </form>
  );
}
