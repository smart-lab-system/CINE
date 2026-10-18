import { AppButton, BrandMark } from './ui';

export function LandingScreen({
  onExam,
  onMgmt,
}: {
  onExam: () => void;
  onMgmt: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <BrandMark />
      <h1 className="-mb-1 text-h2 font-bold">ExamCollect Agent</h1>
      <p className="text-small text-muted-foreground">
        Chọn chế độ làm việc trên máy này. Hai lựa chọn tách biệt — vào phiên thi không mở module
        Quản lý.
      </p>
      <div className="mt-2 flex flex-col gap-2.5">
        <AppButton type="button" onClick={onExam}>
          Vào phiên thi
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onMgmt}>
          Quản lý
        </AppButton>
      </div>
      <p className="mt-auto text-caption text-muted-foreground">
        Phiên thi: sinh viên nhập MSSV + mã phiên. Quản lý: giảng viên đăng nhập tài khoản; sinh viên
        chỉ nhập MSSV để gắn LAN phòng lab.
      </p>
    </div>
  );
}
