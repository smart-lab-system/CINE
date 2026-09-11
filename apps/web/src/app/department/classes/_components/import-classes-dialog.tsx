'use client';

import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useImportClasses, useSemesters } from '@/hooks/useDepartment';
import {
  DEFAULT_CLASS_COLUMN_MAPPING,
  extractClasses,
  type ParsedClassImport,
} from '@/lib/class-import-file';
import { readWorkbook } from '@/lib/read-workbook';

interface ImportClassesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kỳ đang được chọn ở trang, dùng làm giá trị khởi tạo — vẫn đổi được. */
  defaultSemesterId: string | null;
}

/**
 * Import lớp học từ Excel (CLAUDE.md §7.2.1).
 *
 * File .xlsx được đọc ngay ở trình duyệt và không bao giờ lên máy chủ
 * (Security rule 5) — thứ được gửi đi là JSON thường, và chỉ sau khi người
 * dùng đã nhìn thấy hệ thống đọc được những gì.
 *
 * Học kỳ được hỏi TƯỜNG MINH đúng một lần cho cả file: theo §3.2 chỉ có
 * một nơi trong hệ thống hỏi "học kỳ nào" là form tạo `Course`, và màn này
 * chính là form đó ở dạng hàng loạt. Không suy ngầm từ bộ lọc trang, vì
 * import vào nhầm kỳ là loại lỗi phải dọn bằng tay từng dòng.
 */
export function ImportClassesDialog({
  open,
  onOpenChange,
  defaultSemesterId,
}: ImportClassesDialogProps) {
  const semesters = useSemesters();
  const importClasses = useImportClasses();

  const [semesterId, setSemesterId] = useState<string | null>(defaultSemesterId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedClassImport | null>(null);

  function reset() {
    setFileName(null);
    setFileError(null);
    setParsed(null);
    importClasses.reset();
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    reset();
    try {
      const sheets = await readWorkbook(file);
      if (sheets.length === 0) {
        setFileError('File không có sheet nào đọc được.');
        return;
      }
      setParsed(extractClasses(sheets[0].rows, DEFAULT_CLASS_COLUMN_MAPPING));
      setFileName(file.name);
    } catch (error) {
      // File thư viện không mở được là ca thường gặp nhất ở đây — .xls cũ,
      // hoặc .csv đổi tên. Nói ra điều đó, thay vì lặp lại lời của parser.
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy lưu lại dưới định dạng .xlsx rồi thử lại.',
      );
    }
  }

  const readyRows = parsed?.rows ?? [];
  const canSubmit = semesterId !== null && readyRows.length > 0 && !importClasses.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import lớp học từ Excel</DialogTitle>
          <DialogDescription>
            File được đọc ngay trên trình duyệt và không được tải lên máy chủ. Chỉ khi bạn bấm
            xác nhận, các dòng đã đọc mới được gửi đi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-semester">Học kỳ cho toàn bộ file</Label>
            <Select value={semesterId ?? ''} onValueChange={setSemesterId}>
              <SelectTrigger id="import-semester">
                <SelectValue placeholder="Chọn học kỳ" />
              </SelectTrigger>
              <SelectContent>
                {(semesters.data ?? []).map((semester) => (
                  <SelectItem key={semester.id} value={semester.id}>
                    {semester.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">
              Mọi môn học tạo mới từ file này sẽ thuộc học kỳ đã chọn.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-classes-file">File .xlsx</Label>
            <p className="text-caption text-muted-foreground">
              Bốn cột đầu theo đúng thứ tự: Mã môn, Tên môn, Tên lớp, Email giảng viên. Dòng
              đầu tiên là tiêu đề.
            </p>
            <input
              id="import-classes-file"
              type="file"
              accept=".xlsx"
              className="block w-full text-small file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground hover:file:bg-primary-strong"
              onChange={(event) => void onPickFile(event.target.files?.[0])}
            />
            {fileName && (
              <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                {fileName}
              </p>
            )}
          </div>

          {fileError && (
            <Alert variant="destructive">
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {/* Lỗi đọc file hiện CẠNH các dòng đọc được, không thay cho chúng:
              một môn gõ sai email không chặn 49 môn còn lại, nên người dùng
              cần thấy cả hai con số trước khi bấm. */}
          {parsed && parsed.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium">{parsed.errors.length} dòng sẽ bị bỏ qua:</p>
                <ul className="mt-2 list-disc pl-4">
                  {parsed.errors.slice(0, 10).map((error) => (
                    <li key={error.row}>
                      {error.row === 0 ? 'File' : `Dòng ${error.row}`}: {error.reason}
                    </li>
                  ))}
                </ul>
                {parsed.errors.length > 10 && (
                  <p className="mt-1">…và {parsed.errors.length - 10} dòng nữa.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {readyRows.length > 0 && (
            <p className="text-small">
              <span className="font-medium">{readyRows.length}</span> dòng sẵn sàng import.
            </p>
          )}

          {importClasses.data && (
            <Alert variant={importClasses.data.errors.length > 0 ? 'destructive' : 'success'}>
              <AlertDescription>
                Đã tạo {importClasses.data.coursesCreated} môn học,{' '}
                {importClasses.data.classesCreated} lớp mới, cập nhật{' '}
                {importClasses.data.classesUpdated} lớp.
                {importClasses.data.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-4">
                    {importClasses.data.errors.map((error) => (
                      // +2: `row` là chỉ số 0-based trong mảng đã gửi, còn
                      // người dùng đang nhìn bảng tính có một dòng tiêu đề.
                      <li key={error.row}>
                        Dòng {error.row + 2}: {error.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {importClasses.isError && (
            <Alert variant="destructive">
              <AlertDescription>{importClasses.error.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            loading={importClasses.isPending}
            onClick={() => {
              if (!semesterId) return;
              importClasses.mutate({ semesterId, rows: readyRows });
            }}
          >
            Import {readyRows.length > 0 ? `${readyRows.length} dòng` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
