'use client';

import { useMemo, useState } from 'react';
import { CircleCheckBig, FileSpreadsheet, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { readWorkbook, type SheetData } from '@/lib/read-workbook';
import {
  diffRoster,
  extractRoster,
  suggestColumnMapping,
  type ColumnMapping,
  type RosterDiff,
} from '@/lib/roster-file';
import type { RosterEntry, RosterImportResult } from '@/lib/api/roster';
import { ColumnMapper } from '@/components/roster/column-mapper';
import { ImportReview } from '@/components/roster/import-review';
import {
  ManualAddStudentForm,
  type AddStudentPayload,
} from '@/components/roster/manual-add-student-form';

const DEFAULT_MAPPING: ColumnMapping = {
  headerRows: 0,
  mssvColumn: 0,
  nameColumns: [1],
};

export type RosterScreenAdapters = {
  roster: UseQueryResult<RosterEntry[], Error>;
  importRoster: UseMutationResult<
    RosterImportResult,
    Error,
    { students: RosterEntry[]; removeMissing: boolean }
  >;
  addStudent: UseMutationResult<RosterEntry, Error, AddStudentPayload>;
  removeStudent: UseMutationResult<void, Error, string>;
};

interface RosterScreenProps {
  canEdit: boolean;
  adapters: RosterScreenAdapters;
  /** Admin: gợi ý / tạo SV từ catalog master-data. */
  catalogAssist?: boolean;
}

/**
 * Danh sách SV của lớp — Excel đọc trên trình duyệt, chọn cột MSSV / họ tên
 * (nhiều cột được), xem diff rồi mới gửi JSON lên API.
 */
export function RosterScreen({
  canEdit,
  adapters,
  catalogAssist = false,
}: RosterScreenProps) {
  const { roster, importRoster, addStudent, removeStudent } = adapters;

  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const rows = sheets?.[sheetIndex]?.rows ?? null;

  const parsed = useMemo(
    () => (rows ? extractRoster(rows, mapping) : null),
    [rows, mapping],
  );

  const diff: RosterDiff | null = useMemo(() => {
    if (!parsed || parsed.errors.length > 0 || !roster.data) return null;
    return diffRoster(roster.data, parsed.students);
  }, [parsed, roster.data]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setFileError(null);
    setRemoveMissing(false);
    try {
      const read = await readWorkbook(file);
      if (read.length === 0) {
        setFileError('File không có sheet nào đọc được.');
        return;
      }
      setSheets(read);
      setSheetIndex(0);
      setFileName(file.name);
      // Gợi ý cột MSSV / họ tên từ nội dung; user vẫn sửa được.
      setMapping(suggestColumnMapping(read[0]?.rows ?? []));
    } catch (error) {
      setSheets(null);
      setMapping(DEFAULT_MAPPING);
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy dùng .xls hoặc .xlsx rồi thử lại.',
      );
    }
  }

  function onSheetChange(index: number) {
    setSheetIndex(index);
    const nextRows = sheets?.[index]?.rows ?? [];
    setMapping(suggestColumnMapping(nextRows));
    setRemoveMissing(false);
  }

  function onConfirm() {
    if (!parsed || parsed.errors.length > 0) return;
    importRoster.mutate(
      { students: parsed.students, removeMissing },
      {
        onSuccess: (imported) => {
          setResult(imported);
          setSheets(null);
          setFileName('');
          setRemoveMissing(false);
        },
      },
    );
  }

  return (
    <>
      {result && (
        <Alert variant="success">
          <CircleCheckBig />
          <AlertDescription>
            Đã nhập xong: thêm {result.added}, cập nhật {result.updated}, giữ nguyên{' '}
            {result.unchanged}
            {result.removed > 0 ? `, xoá ${result.removed}` : ''}.
          </AlertDescription>
        </Alert>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" aria-hidden="true" />
              Nhập nhanh từ file Excel
            </CardTitle>
            <CardDescription>
              Đọc trên trình duyệt — hệ thống gợi ý cột và chỉ lấy dòng có MSSV đúng 8 chữ
              số. Bạn vẫn chọn lại cột MSSV / họ tên (1 hoặc 2 cột) trước khi xác nhận.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <input
                id="roster-file"
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
                <Label htmlFor="roster-sheet">Sheet</Label>
                <Select
                  value={String(sheetIndex)}
                  onValueChange={(value) => onSheetChange(Number(value))}
                >
                  <SelectTrigger id="roster-sheet" className="max-w-sm">
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

            {rows && <ColumnMapper rows={rows} mapping={mapping} onChange={setMapping} />}

            {parsed && (
              <ImportReview
                errors={parsed.errors}
                diff={diff}
                skipped={parsed.skipped}
                studentCount={parsed.students.length}
                removeMissing={removeMissing}
                onRemoveMissingChange={setRemoveMissing}
              />
            )}

            {importRoster.isError && (
              <Alert variant="destructive">
                {/* Carries the server's own message: a 409 names the students
                    who already belong to another class of this course, and
                    that text is the only way the user learns which ones. */}
                <AlertDescription>{importRoster.error.message}</AlertDescription>
              </Alert>
            )}

            {parsed && parsed.errors.length === 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={onConfirm}
                  loading={importRoster.isPending}
                  variant={removeMissing ? 'destructive' : 'default'}
                >
                  {removeMissing
                    ? `Xác nhận và xoá ${diff?.missing.length ?? 0} sinh viên`
                    : 'Xác nhận nhập danh sách'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
              Thêm thủ công một sinh viên
            </CardTitle>
            <CardDescription>
              {catalogAssist
                ? 'Gõ MSSV để gợi ý từ catalog — khớp thì tự điền tên; chưa có thì tạo sinh viên mới rồi thêm vào lớp.'
                : 'Cho trường hợp chuyển lớp muộn hoặc sửa sót — không phải gửi lại cả file.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManualAddStudentForm
              catalogAssist={catalogAssist}
              isPending={addStudent.isPending}
              errorMessage={addStudent.isError ? addStudent.error.message : null}
              onAdd={async (payload) => {
                await addStudent.mutateAsync(payload);
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            Đang có trong lớp
            {roster.data && (
              <span className="tabular-nums text-muted-foreground">
                ({roster.data.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {removeStudent.isError && (
            <div className="px-6 pb-4">
              <Alert variant="destructive">
                <AlertDescription>{removeStudent.error.message}</AlertDescription>
              </Alert>
            </div>
          )}

          {roster.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : roster.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{roster.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (roster.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Users}
              title="Lớp này chưa có sinh viên nào"
              description="Chưa nhập danh sách thì phiên thi không biết chờ bao nhiêu người, và mọi sinh viên đều bị từ chối khi vào phòng thi."
              tone="muted"
            />
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className="w-40">
                      MSSV
                    </TableHead>
                    <TableHead scope="col">Họ và tên</TableHead>
                    {canEdit && (
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">Hành động</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.data!.map((student) => (
                    <TableRow key={student.mssv}>
                      <TableCell className="font-mono font-medium">{student.mssv}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      {canEdit && (
                        <TableCell className="whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Xoá ${student.mssv} khỏi lớp`}
                            loading={
                              removeStudent.isPending && pendingRemove === student.mssv
                            }
                            onClick={() => {
                              setPendingRemove(student.mssv);
                              removeStudent.mutate(student.mssv);
                            }}
                          >
                            <Trash2
                              className="h-4 w-4 text-danger-strong"
                              aria-hidden="true"
                            />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
