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
        Fallback thủ công (máy chưa resolve catalog). Luồng chính: agent tự mở theo vai trò máy -
        SV chờ Hub, GV đăng nhập Teacher Hub.
      </p>
      <div className="mt-2 flex flex-col gap-2.5">
        <AppButton type="button" onClick={onExam}>
          Vào phiên thi (thủ công)
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onMgmt}>
          Quản lý (thủ công)
        </AppButton>
      </div>
      <p className="mt-auto text-caption text-muted-foreground">
        Máy trong danh mục phòng không còn thấy màn này - xem spec Hub ép MSSV + auto join.
      </p>
    </div>
  );
}
