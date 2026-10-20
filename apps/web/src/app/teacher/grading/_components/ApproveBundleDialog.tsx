'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTestBundleDetail } from '@/hooks/useTestBundleDetail';
import { casesToRead, runnableCases } from '@/lib/bundle-approval';

/**
 * Duyệt và ghim MỘT phiên bản gói trong một bước (mock-up v2). Duyệt là hành động riêng của giảng viên — không nút sinh nào
 * làm thay — nên hộp thoại này là chỗ họ nhìn các ca lần cuối: bảng ca đang dùng, các ca cần đọc kỹ được đánh dấu, và một ô
 * "tôi đã đọc" phải tích mới bấm được.
 *
 * Dòng "khớp nội bộ, chưa chứng tỏ đúng" luôn hiện, kể cả khi gói do giảng viên tự gõ: duyệt KHÔNG nâng độ tin cậy của thước
 * (spec G2b §4.6) — nó chỉ cho phép chấm. Việc duyệt rồi ghim là hai lời gọi liên tiếp do người gọi làm (`onConfirm`).
 */
export function ApproveBundleDialog({
  sessionId,
  bundle,
  open,
  onOpenChange,
  onConfirm,
}: {
  sessionId: string;
  bundle: { id: string; version: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const detail = useTestBundleDetail(sessionId, open ? bundle.id : null);
  const [read, setRead] = useState(false);

  const active = runnableCases(detail.data?.cases ?? []);
  const mustRead = casesToRead(detail.data?.cases ?? []);
  const loaded = detail.data !== undefined;
  const canConfirm = loaded && active.length > 0 && read;

  function handleOpenChange(next: boolean) {
    if (!next) setRead(false);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Duyệt và ghim phiên bản {bundle.version}</DialogTitle>
          <DialogDescription>
            {loaded
              ? `${active.length} ca dùng để chấm. Sau khi duyệt, bài chấm dùng gói này. Muốn đổi, phải tạo phiên bản mới.`
              : 'Sau khi duyệt, bài chấm dùng gói này. Muốn đổi, phải tạo phiên bản mới.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-r-md border-l-4 border-warning bg-warning/10 px-3 py-2 text-small">
          <strong>Khớp nội bộ, chưa chứng tỏ đúng.</strong> Đáp án và ca cùng do hệ thống viết hoặc do bạn nhập, nên khớp nhau không
          cho biết đúng. Đọc các ca đánh dấu “Đọc kỹ” rồi quyết định.
        </div>

        {detail.isLoading && <p className="text-small text-muted-foreground">Đang tải bộ ca…</p>}
        {detail.isError && (
          <Alert variant="destructive">
            <AlertDescription>{detail.error?.message}</AlertDescription>
          </Alert>
        )}
        {loaded && active.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>Gói này không còn ca nào dùng được — không duyệt được.</AlertDescription>
          </Alert>
        )}

        {active.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-small">
              <caption className="sr-only">Các ca sẽ được duyệt</caption>
              <thead>
                <tr className="text-caption text-muted-foreground">
                  <th scope="col" className="py-1 pr-2">Ca</th>
                  <th scope="col" className="py-1 pr-2">Input</th>
                  <th scope="col" className="py-1 pr-2">Output</th>
                  <th scope="col" className="py-1 pr-2">Trích đề</th>
                  <th scope="col" className="py-1"><span className="sr-only">Ghi chú</span></th>
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.caseKey} className={mustRead.has(c.caseKey) ? 'bg-warning/10' : ''}>
                    <td className="break-all py-1 pr-2 align-top font-mono text-caption font-semibold">{c.caseKey}</td>
                    <td className="whitespace-pre-wrap break-all py-1 pr-2 align-top font-mono text-caption">{c.input}</td>
                    <td className="whitespace-pre-wrap break-all py-1 pr-2 align-top font-mono text-caption">{c.expectedOutput}</td>
                    <td className="py-1 pr-2 align-top">
                      {c.constraintQuote ? `“${c.constraintQuote}”` : <span className="text-muted-foreground">Chưa có trích đề</span>}
                    </td>
                    <td className="py-1 align-top">{mustRead.has(c.caseKey) && <Badge variant="warning">Đọc kỹ</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-small">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={read}
            onChange={(e) => setRead(e.target.checked)}
          />
          Tôi đã đọc các ca cần đọc kỹ và thấy đúng với đề
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            Để sau
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm();
              handleOpenChange(false);
            }}
          >
            Duyệt và ghim phiên bản {bundle.version}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
