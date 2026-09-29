import type { ResultDetail } from '@/lib/api/grading';

export function CoverageSection({ investigation }: { investigation: NonNullable<ResultDetail['investigation']> }) {
  const runTestsCalls = investigation.investigation.toolCalls.filter((c) => c.tool === 'run_tests');
  // Chỉ lượt chạy THẬT là độ phủ: lượt lỗi hay bị chặn vì trùng không kiểm được gì, đếm vào là thổi phồng
  // đúng con số mà mục này sinh ra để giữ cho trung thực.
  const ran = runTestsCalls.filter((c) => c.status === 'ok').length;
  const notRun = runTestsCalls.length - ran;
  const replay = investigation.replay;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-label">Độ phủ điều tra</h2>
      <p className="text-caption text-muted-foreground">
        "Không tìm thấy lỗi" và "đã kiểm và không có lỗi" là hai chuyện khác nhau. Đây là phần đã kiểm.
      </p>
      <ul className="flex flex-col gap-1 text-small">
        <li>Đã chạy {ran} lượt gói test.</li>
        {notRun > 0 && <li>{notRun} lượt khác không chạy được (lỗi hoặc bị chặn) — không tính là đã kiểm.</li>}
        {replay && (
          <li>
            Chạy lại ngẫu nhiên lời gọi #{replay.toolCallId} →{' '}
            {replay.matched === true ? 'khớp' : replay.matched === false ? 'lệch' : 'chưa chạy lại được để đối chiếu'}.
          </li>
        )}
      </ul>
      <div className="relative rounded-lg border border-dashed border-border bg-surface p-3">
        <span className="absolute -top-2.5 right-3 rounded-sm border border-dashed border-border bg-background px-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          chưa có
        </span>
        <h3 className="text-small font-semibold">Độ phức tạp đo được</h3>
        <p className="mt-1 text-caption text-muted-foreground">
          Cần công cụ đo độ phức tạp (bước 4 của spec chấm điểm) — chưa xây. Bài nộp chưa được so với đề theo lớp thời
          gian chạy.
        </p>
      </div>
    </section>
  );
}
