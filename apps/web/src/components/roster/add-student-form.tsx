'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStudentLookup } from '@/hooks/useStudentLookup';
import type { RosterEntry } from '@/lib/api/roster';

interface AddStudentFormProps {
  onSubmit: (student: RosterEntry) => Promise<unknown>;
  submitting: boolean;
  /** Lỗi của lần thêm trước (vd 409 nêu sinh viên đang ở lớp khác) — hiện nguyên văn, không xoá form. */
  error: Error | null;
}

/**
 * Thêm tay MỘT sinh viên vào danh sách lớp — gõ MSSV là tự hiện tên (spec §2.6).
 *
 * Tên sinh viên chỉ có MỘT chỗ (bảng `student`). Gõ MSSV đã có thì ô tên được điền sẵn và KHOÁ: để giảng viên gõ tên khác sẽ tạo ra hai cái
 * tên cho một sinh viên, và cái nào thắng thì tuỳ thứ tự — đúng lỗi mà tách `student` ra để chấm dứt. Muốn đổi tên thì nhập file danh sách
 * (file mới nhất thắng, và kết quả nêu rõ ai bị đổi). MSSV mới thì tên BẮT BUỘC.
 *
 * Tra cứu LỖI (429 giới hạn tốc độ, mạng) không chặn việc thêm: server không ghi đè tên đã lưu bằng tên gõ, nên gõ tên khi không tra được là
 * an toàn — khoá mãi ô tên ở đây chỉ làm giảng viên không thêm được ai vào đúng lúc đang vội.
 */
export function AddStudentForm({ onSubmit, submitting, error }: AddStudentFormProps) {
  const [mssv, setMssv] = useState('');
  const [name, setName] = useState('');
  const lookup = useStudentLookup(mssv);

  const known = lookup.data ?? null;
  const looking = lookup.isFetching;
  const lookupFailed = lookup.isError;
  const isNew = lookup.isSuccess && known === null;

  // Tên GỬI ĐI: nếu MSSV đã có thì tên đã lưu, bất kể giảng viên từng gõ gì trước khi tra ra.
  const nameValue = known ? known.fullName : name;
  const nameLocked = known !== null || looking;
  const canSubmit = mssv.trim() !== '' && nameValue.trim() !== '' && !looking && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({ mssv: mssv.trim(), name: nameValue.trim() });
      setMssv('');
      setName('');
    } catch {
      // Lý do đã hiện qua `error`; form giữ nguyên để sửa rồi gửi lại.
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-52">
          <Label htmlFor="manual-mssv">MSSV</Label>
          <Input
            id="manual-mssv"
            required
            className="font-mono"
            placeholder="vd: SV20120001"
            value={mssv}
            onChange={(event) => setMssv(event.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="manual-name">Họ và tên</Label>
          <Input
            id="manual-name"
            required
            placeholder="vd: Nguyễn Văn A"
            value={nameValue}
            disabled={nameLocked}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" loading={submitting} disabled={!canSubmit} className="shrink-0">
          Thêm
        </Button>
      </div>

      {looking && <p className="text-caption text-muted-foreground">Đang tra tên…</p>}
      {known && (
        <p className="text-caption text-muted-foreground">
          Tên đã có trong hệ thống và được giữ nguyên. Muốn đổi tên, hãy nhập file danh sách (file mới nhất thắng).
        </p>
      )}
      {isNew && <p className="text-caption text-muted-foreground">MSSV mới: nhập họ và tên.</p>}
      {lookupFailed && (
        <p className="text-caption text-warning-strong">
          Không tra được tên: {lookup.error?.message}. Bạn vẫn thêm được — nếu MSSV đã có, hệ thống dùng tên đã lưu.
        </p>
      )}
    </form>
  );
}
