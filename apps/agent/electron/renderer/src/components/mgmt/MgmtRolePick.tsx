import { AppButton, BrandMark } from '../ui';

export function MgmtRolePick({
  onTeacher,
  onStudent,
  onBack,
}: {
  onTeacher: () => void;
  onStudent: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">Quản lý</h1>
      <p className="text-small text-muted-foreground">Đăng nhập theo vai trò trên máy này.</p>
      <div className="mt-2 flex flex-col gap-2.5">
        <AppButton type="button" onClick={onTeacher}>
          Giảng viên
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onStudent}>
          Sinh viên
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onBack}>
          Quay lại
        </AppButton>
      </div>
    </div>
  );
}
