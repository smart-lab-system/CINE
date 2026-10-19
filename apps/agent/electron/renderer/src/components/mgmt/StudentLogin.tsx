import { useState, type FormEvent } from 'react';
import { AppButton, BrandMark, Field, Spinner, StatusLine } from '../ui';

const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;

export function StudentLogin({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: (payload: { mssv: string; fullName: string }) => void;
}) {
  const [mssv, setMssv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const cleaned = mssv.replace(NON_ALPHANUMERIC, '').slice(0, 20);
    if (cleaned.length < 4) {
      setError('Nhập MSSV hợp lệ (4–20 ký tự chữ/số).');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.agent.mgmtStartStudentNode({ mssv: cleaned });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Không xác thực được MSSV.');
      return;
    }
    onSuccess({
      mssv: result.mssv ?? cleaned,
      fullName: result.fullName ?? '',
    });
  };

  if (busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">Đang kiểm tra MSSV trên hệ thống…</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Sinh viên — Quản lý</h1>
      <p className="text-small text-muted-foreground">
        Nhập MSSV. Hệ thống đối chiếu danh sách sinh viên; chỉ máy có MSSV hợp lệ mới gắn vào Teacher
        Hub.
      </p>
      <Field
        label="MSSV"
        value={mssv}
        onChange={(e) => setMssv(e.target.value.replace(NON_ALPHANUMERIC, '').slice(0, 20))}
        autoComplete="off"
        required
      />
      {error && <StatusLine tone="danger">{error}</StatusLine>}
      <AppButton type="submit">Xác nhận MSSV</AppButton>
      <AppButton type="button" variant="ghost" onClick={onBack}>
        Quay lại
      </AppButton>
    </form>
  );
}
