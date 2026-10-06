'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheckBig, Download, FileSpreadsheet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImportColumnMapper } from '@/components/import/import-column-mapper';
import { ImportPreview } from '@/components/import/import-preview';
import {
  detectBestSheet,
  detectMapping,
  extractImportRows,
  type ImportKind,
  type ImportMapping,
} from '@/lib/import/columns';
import {
  ImportRejectedError,
  type ImportResult,
  type RunImport,
} from '@/lib/import/import-types';
import { downloadTemplate } from '@/lib/import/template';
import { readWorkbook, type SheetData } from '@/lib/read-workbook';

interface ImportWizardProps {
  kind: ImportKind;
  /** BẮT BUỘC, không có mặc định: giao diện không biết gì về mạng, và test truyền một hàm giả. */
  run: RunImport;
  readSheets?: (file: File) => Promise<SheetData[]>;
  onImported?: (result: ImportResult) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Có lỗi xảy ra, hãy thử lại.';
}

/**
 * Luồng nhập của MỘT loại dữ liệu nền, theo đúng thứ tự các quyết định: chọn file → (chọn sheet) → cột nào là gì → XEM TRƯỚC
 * → xác nhận. Không có gì được ghi cho tới bước cuối.
 *
 * Xem trước luôn là kết quả `run({ dryRun: true })` của server (spec §6.2 nguyên tắc 5): đây là component duy nhất giữ trạng
 * thái, và nó không tự tính gì. Hai điều nó phải giữ đúng:
 *   - nút xác nhận gửi ĐÚNG các dòng đã được xem trước (`extracted.rows`), không đọc lại file;
 *   - đáp ứng `dryRun` đến muộn không ghi đè đáp ứng mới (`requestId`) — nếu không, đổi file nhanh tay sẽ cho xem trước của
 *     file này và xác nhận của file kia.
 */
export function ImportWizard({ kind, run, readSheets = readWorkbook, onImported }: ImportWizardProps) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [detected, setDetected] = useState(false);
  const [mapperOpen, setMapperOpen] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);
  // Đổi `key` của ô chọn file để chọn lại CÙNG một file (sau khi sửa nó) vẫn kích hoạt `onChange`.
  const [inputKey, setInputKey] = useState(0);

  const requestId = useRef(0);
  // `run` có thể là hàm mới ở mỗi lần render của cha; giữ nó trong ref để effect xem trước chỉ chạy khi DÒNG đổi, không phải
  // khi cha render lại (nếu không, mỗi lần cha render là một lần gọi `dryRun`).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const rows = sheets?.[sheetIndex]?.rows ?? null;
  const extracted = useMemo(
    () => (rows && mapping ? extractImportRows(rows, mapping, kind) : null),
    [rows, mapping, kind],
  );

  // Xem trước mỗi khi dòng đã tách đổi (file mới, sheet khác, chỉnh cột).
  useEffect(() => {
    requestId.current += 1;
    const id = requestId.current;
    setPreview(null);
    setRunError(null);
    setConfirmSimilar(false);
    if (!extracted || extracted.problems.length > 0) {
      setChecking(false);
      return;
    }
    setChecking(true);
    runRef
      .current({ rows: extracted.rows, dryRun: true })
      .then((result) => {
        if (id === requestId.current) setPreview(result);
      })
      .catch((error: unknown) => {
        if (id === requestId.current) setRunError(messageOf(error));
      })
      .finally(() => {
        if (id === requestId.current) setChecking(false);
      });
  }, [extracted]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setFileError(null);
    try {
      const read = await readSheets(file);
      if (read.length === 0) {
        setFileError('File không có sheet nào đọc được.');
        return;
      }
      const index = detectBestSheet(read, kind);
      const result = detectMapping(read[index].rows, kind);
      setSheets(read);
      setSheetIndex(index);
      setMapping(result.mapping);
      setDetected(result.detected);
      setMapperOpen(!result.detected);
      setFileName(file.name);
    } catch (error) {
      // Một file thư viện không mở được là ca thường gặp: .xls cũ hoặc .csv đổi đuôi. Nói thẳng thay vì chữ của parser.
      setSheets(null);
      setMapping(null);
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy lưu lại dưới định dạng .xlsx rồi thử lại.',
      );
    }
  }

  function onSheetChange(value: string) {
    if (!sheets) return;
    const index = Number(value);
    const result = detectMapping(sheets[index].rows, kind);
    setSheetIndex(index);
    setMapping(result.mapping);
    setDetected(result.detected);
    setMapperOpen(!result.detected);
  }

  async function onConfirm() {
    if (!extracted || !preview) return;
    setSaving(true);
    setRunError(null);
    try {
      const result = await run({ rows: extracted.rows, dryRun: false, confirmSimilar });
      setDone(result);
      setSheets(null);
      setMapping(null);
      setFileName('');
      setInputKey((key) => key + 1);
      onImported?.(result);
    } catch (error) {
      if (error instanceof ImportRejectedError) {
        // Trạng thái đã đổi từ lúc xem trước: hiện lại bản MỚI NHẤT mà server gửi kèm, và bỏ tick (nó áp cho bản cũ).
        setPreview(error.preview);
        setConfirmSimilar(false);
      }
      setRunError(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  const confirmCount = preview ? preview.counts.added + preview.counts.updated : 0;
  const blocked =
    !extracted ||
    extracted.problems.length > 0 ||
    !preview ||
    checking ||
    saving ||
    preview.counts.errors > 0 ||
    confirmCount === 0 ||
    (preview.needsSimilarConfirmation && !confirmSimilar);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-small text-muted-foreground">
        File được đọc ngay trên trình duyệt và không được tải lên máy chủ. Chỉ các dòng đã đọc được gửi đi để kiểm tra;
        không có gì được ghi cho tới khi bạn xác nhận.
      </p>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small font-medium">Cột cần có</p>
          <Button variant="outline" size="sm" onClick={() => void downloadTemplate(kind)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Tải file mẫu
          </Button>
        </div>
        <ul className="flex flex-col gap-0.5 text-small">
          {kind.columns.map((column) => (
            <li key={column.key}>
              <span className="font-medium">
                {column.label}
                {column.required ? '' : ' (không bắt buộc)'}
              </span>
              <span className="text-muted-foreground"> — {column.hint}</span>
            </li>
          ))}
        </ul>
      </div>

      {done && (
        <Alert variant={done.applied ? 'success' : 'info'}>
          {done.applied && <CircleCheckBig />}
          <AlertDescription>
            {done.applied
              ? `Đã nhập xong: thêm ${done.counts.added}, cập nhật ${done.counts.updated}, giữ nguyên ${done.counts.unchanged}.`
              : 'Không có gì thay đổi nên không có gì được ghi.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">File Excel (.xlsx)</Label>
        <input
          key={inputKey}
          id="import-file"
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

      {sheets && sheets.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-sheet">Sheet</Label>
          <Select value={String(sheetIndex)} onValueChange={onSheetChange}>
            <SelectTrigger id="import-sheet" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((sheet, index) => (
                <SelectItem key={sheet.name} value={String(index)}>
                  {sheet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {rows && mapping && (
        <div className="flex flex-col gap-3">
          {detected ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-small">
              <span className="text-muted-foreground">Đã nhận diện cột theo tên.</span>
              <Button variant="ghost" size="sm" onClick={() => setMapperOpen((open) => !open)}>
                Chỉnh cột
              </Button>
            </div>
          ) : (
            <Alert variant="warning">
              <AlertDescription>
                Chưa nhận diện được tên cột của file này. Hãy chọn cột tương ứng cho từng mục bên dưới.
              </AlertDescription>
            </Alert>
          )}
          {mapperOpen && (
            <ImportColumnMapper
              kind={kind}
              rows={rows}
              mapping={mapping}
              onChange={(next) => {
                setMapping(next);
                setDetected(false);
              }}
            />
          )}
        </div>
      )}

      {extracted && extracted.problems.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {extracted.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {checking && <p className="text-small text-muted-foreground">Đang kiểm tra file…</p>}

      {preview && (
        <ImportPreview
          kind={kind}
          result={preview}
          confirmSimilar={confirmSimilar}
          onConfirmSimilarChange={setConfirmSimilar}
        />
      )}

      {runError && (
        <Alert variant="destructive">
          {/* Chữ của server: một 409/400 nêu đúng mục nào gây lỗi, và đó là cách duy nhất người dùng biết. */}
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {mapping && (
        <div className="flex justify-end">
          <Button onClick={() => void onConfirm()} loading={saving} disabled={blocked}>
            {`Xác nhận nhập ${confirmCount} dòng`}
          </Button>
        </div>
      )}
    </div>
  );
}
