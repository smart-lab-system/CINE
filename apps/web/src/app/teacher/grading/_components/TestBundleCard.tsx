'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useApproveTestBundle,
  useCreateTestBundle,
  usePinTestBundle,
  useTestBundles,
} from '@/hooks/useTestBundle';
import type { TestBundleCaseInput } from '@/lib/api/test-bundle';

type DraftCase = TestBundleCaseInput;

const EMPTY_ROW: DraftCase = { caseKey: '', group: '', input: '', expectedOutput: '' };

/**
 * Gói test của một phiên (§14.1) — chỉ hiện trên trang Chấm điểm khi phiên
 * có ít nhất một deliverable `code_project` (kiểm ở `page.tsx`, nơi gọi
 * component này). Giảng viên tự tay gõ ca; sinh ca tự động từ đáp án mẫu
 * là việc khác, chưa nối vào đây.
 */
export function TestBundleCard({
  sessionId,
  pinnedBundleId,
}: {
  sessionId: string;
  pinnedBundleId: string | null;
}) {
  const bundles = useTestBundles(sessionId);
  const createBundle = useCreateTestBundle(sessionId);
  const approveBundle = useApproveTestBundle(sessionId);
  const pinBundle = usePinTestBundle(sessionId);
  const [rows, setRows] = useState<DraftCase[]>([{ ...EMPTY_ROW }]);

  function updateRow(index: number, patch: Partial<DraftCase>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submitDraft() {
    const cases = rows.filter((row) => row.caseKey.trim() !== '');
    if (cases.length === 0) return;
    createBundle.mutate(cases, {
      onSuccess: () => setRows([{ ...EMPTY_ROW }]),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Gói test</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bundles.isLoading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : (bundles.data?.length ?? 0) === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
            Chưa có gói test nào — bài code không chấm được cho tới khi có một gói đã duyệt và
            ghim (§14.3).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bundles.data!.map((bundle) => (
              <li
                key={bundle.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3 text-small"
              >
                <span className="font-medium">Phiên bản {bundle.version}</span>
                <span className="text-caption text-muted-foreground">{bundle.caseCount} ca</span>
                {bundle.id === pinnedBundleId ? (
                  <Badge variant="accent">Đang dùng</Badge>
                ) : bundle.approvedAt ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => pinBundle.mutate(bundle.id)}>
                    Ghim
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={approveBundle.isPending}
                    onClick={() => approveBundle.mutate(bundle.id)}
                  >
                    Duyệt
                  </Button>
                )}
                {bundle.approvedAt && (
                  <span className="text-caption text-muted-foreground">
                    Đã duyệt lúc {new Date(bundle.approvedAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
          <p className="text-small font-medium">Tạo phiên bản mới</p>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <Label htmlFor={`case-key-${index}`} className="sr-only">
                  Tên ca
                </Label>
                <Input
                  id={`case-key-${index}`}
                  placeholder="Tên ca (vd: ca1)"
                  value={row.caseKey}
                  onChange={(e) => updateRow(index, { caseKey: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`case-group-${index}`} className="sr-only">
                  Nhóm
                </Label>
                <Input
                  id={`case-group-${index}`}
                  placeholder="Nhóm (vd: co_ban)"
                  value={row.group}
                  onChange={(e) => updateRow(index, { group: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`case-input-${index}`} className="sr-only">
                  Input
                </Label>
                <Input
                  id={`case-input-${index}`}
                  placeholder="Input"
                  value={row.input}
                  onChange={(e) => updateRow(index, { input: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`case-expected-${index}`} className="sr-only">
                  Output mong đợi
                </Label>
                <Input
                  id={`case-expected-${index}`}
                  placeholder="Output mong đợi"
                  value={row.expectedOutput}
                  onChange={(e) => updateRow(index, { expectedOutput: e.target.value })}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
            >
              Thêm ca
            </Button>
            <Button type="button" size="sm" loading={createBundle.isPending} onClick={submitDraft}>
              Tạo gói
            </Button>
          </div>
          {createBundle.isError && (
            <p className="text-small font-medium text-danger-strong">{createBundle.error.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
