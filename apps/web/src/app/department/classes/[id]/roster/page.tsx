'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CircleCheckBig, FileSpreadsheet, Upload, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
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
import {
  useImportRoster,
  useMyClasses,
  useMyCourses,
  useRoster,
} from '@/hooks/useDepartment';
import { readWorkbook, type SheetData } from '@/lib/read-workbook';
import {
  diffRoster,
  extractRoster,
  type ColumnMapping,
  type RosterDiff,
} from '@/lib/roster-file';
import type { RosterImportResult } from '@/lib/api/roster';
import { ColumnMapper } from './_components/column-mapper';
import { ImportReview } from './_components/import-review';

const DEFAULT_MAPPING: ColumnMapping = { headerRows: 1, mssvColumn: 0, nameColumn: 1 };

/**
 * The class list, imported from the Excel the training office issues.
 *
 * The file is read here in the browser and posted as JSON — CLAUDE.md
 * Security rule 5 keeps uploads off the NestJS server, and this screen is
 * not the place to make an exception for a 10KB spreadsheet.
 *
 * The order of the screen is the order of the decisions: what is on the list
 * now, then the file, then which columns it uses, then exactly what would
 * change, and only then a confirm. Nothing is written until the last step.
 */
export default function ClassRosterPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;

  const classes = useMyClasses();
  const courses = useMyCourses();
  const roster = useRoster(classId);
  const importRoster = useImportRoster(classId);

  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [result, setResult] = useState<RosterImportResult | null>(null);

  const klass = classes.data?.find((c) => c.id === classId);
  const course = courses.data?.find((c) => c.id === klass?.courseId);

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
    setMapping(DEFAULT_MAPPING);
    try {
      const read = await readWorkbook(file);
      if (read.length === 0) {
        setFileError('File không có sheet nào đọc được.');
        return;
      }
      setSheets(read);
      setSheetIndex(0);
      setFileName(file.name);
    } catch (error) {
      setSheets(null);
      // A file the library cannot open is the common case here — an .xls
      // saved from an old Excel, or a .csv renamed. Say which, rather than
      // showing a parser's own words.
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy lưu lại dưới định dạng .xlsx rồi thử lại.',
      );
    }
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title={klass ? `Danh sách lớp — ${klass.name}` : 'Danh sách lớp'}
        description={
          course
            ? `${course.code} — ${course.name}. Đây là danh sách quyết định ai được vào phiên thi của lớp này.`
            : 'Danh sách quyết định ai được vào phiên thi của lớp này.'
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/department/classes">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách lớp học
            </Link>
          </Button>
        }
      />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" aria-hidden="true" />
            Nhập từ file Excel
          </CardTitle>
          <CardDescription>
            File được đọc ngay trên trình duyệt và không được tải lên máy chủ. Chỉ khi bạn
            bấm xác nhận, danh sách đã đọc mới được gửi đi.
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
              <label className="text-small font-medium" htmlFor="roster-sheet">
                Sheet
              </label>
              <Select
                value={String(sheetIndex)}
                onValueChange={(value) => setSheetIndex(Number(value))}
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

          {rows && (
            <ColumnMapper rows={rows} mapping={mapping} onChange={setMapping} />
          )}

          {parsed && (
            <ImportReview
              errors={parsed.errors}
              diff={diff}
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

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            Đang có trong lớp
            {roster.data && (
              <span className="text-muted-foreground tabular-nums">
                ({roster.data.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.data!.map((student) => (
                    <TableRow key={student.mssv}>
                      <TableCell className="font-mono font-medium">{student.mssv}</TableCell>
                      <TableCell>{student.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
