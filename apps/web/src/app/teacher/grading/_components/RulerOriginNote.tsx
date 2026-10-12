'use client';

import { useExamSessionDetail } from '@/hooks/useExamSession';
import { useTestBundles } from '@/hooks/useTestBundle';

/**
 * Một DÒNG trung tính về nguồn gốc thước của phiên — không phải cảnh báo (UI spec §3.7, T-UI-17).
 *
 * MỘT lần mỗi trang, không mỗi dòng bài: `grading_result` không mang `test_bundle_id`, nên đẩy xuống từng dòng là
 * N lần lặp một câu không đổi và N request thừa. Câu này có mặt ở mọi trang hiển thị kết quả bài CODE (danh sách
 * và hồ sơ) — đó là cách thoả "mọi dòng" của spec. Bài tự luận chấm theo rubric, không dùng gói test, nên không
 * có dòng này ở màn tự luận.
 *
 * Không nói gì khi gói do giảng viên tự viết, khi chưa có gói ghim, khi đang tải, hoặc khi API không trả `origin`
 * — không bao giờ đoán.
 */
export function RulerOriginNote({ sessionId }: { sessionId: string }) {
  const detail = useExamSessionDetail(sessionId);
  const bundles = useTestBundles(sessionId);

  const pinnedId = detail.data?.testBundleId ?? null;
  const pinned = pinnedId ? bundles.data?.find((b) => b.id === pinnedId) : undefined;
  if (!pinned || (pinned.origin !== 'generated' && pinned.origin !== 'from_model_answer')) return null;

  return (
    <p className="text-caption text-muted-foreground">
      Thước do hệ thống sinh — bạn duyệt lúc{' '}
      {pinned.approvedAt ? new Date(pinned.approvedAt).toLocaleString('vi-VN') : 'không rõ lúc'}.
    </p>
  );
}
