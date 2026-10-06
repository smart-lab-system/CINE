'use client';

import { CircleCheckBig, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { RosterImportResult } from '@/lib/api/roster';

/**
 * Kết quả một lần nhập danh sách. Ngoài các con số, LIỆT KÊ từng sinh viên bị file đổi tên (spec §2.6, §12 mục 3): tên chỉ có một chỗ nên
 * file mới nhất thắng và đổi áp dụng cho MỌI lớp của sinh viên đó — một thay đổi có phạm vi ngoài lớp đang nhập thì không được đổi âm thầm.
 */
export function ImportResultAlert({ result }: { result: RosterImportResult }) {
  const renamed = result.renamed ?? [];
  return (
    <>
      <Alert variant="success">
        <CircleCheckBig />
        <AlertDescription>
          {`Đã nhập xong: thêm ${result.added}, cập nhật ${result.updated}, giữ nguyên ${result.unchanged}${
            result.removed > 0 ? `, xoá ${result.removed}` : ''
          }.`}
        </AlertDescription>
      </Alert>

      {renamed.length > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              File đã đổi tên {renamed.length} sinh viên. Tên chỉ có một chỗ, nên đổi áp dụng cho mọi lớp có sinh viên đó:
            </span>
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto font-mono text-small">
              {renamed.map((entry) => (
                <li key={entry.mssv}>{`${entry.mssv}: "${entry.from}" → "${entry.to}"`}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
