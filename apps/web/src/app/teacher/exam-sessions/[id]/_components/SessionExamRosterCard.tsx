'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ColumnMapper } from '@/components/roster/column-mapper';
import { ImportReview } from '@/components/roster/import-review';
import {
  ManualAddStudentForm,
  type AddStudentPayload,
} from '@/components/roster/manual-add-student-form';
import { useSessionRoster, useAddSessionRosterStudent, useImportSessionRoster, useRemoveSessionRosterStudent } from '@/hooks/useExamSession';
import { useSetupDraftOptional } from './SetupDraftProvider';
import { readWorkbook, type SheetData } from '@/lib/read-workbook';
import {
  diffRoster,
  extractRoster,
  suggestColumnMapping,
  type ColumnMapping,
} from '@/lib/roster-file';
import type { SessionRosterSource } from '@/lib/api/exam-session';

const DEFAULT_MAPPING: ColumnMapping = {
  headerRows: 0,
  mssvColumn: 0,
  nameColumns: [1],
};

const SOURCE_LABEL: Record<SessionRosterSource, string> = {
  class: 'Tự động',
  frozen: 'Tự động',
  manual: 'Thủ công',
  attached: 'Danh sách đính kèm',
};

/**
 * Cap trên wrapper của Table — đó mới là scrollport. Giới hạn ngoài
 * wrapper thì header sticky không dính và danh sách dài đẩy cả bước thiết lập.
 */
const SCROLL_CONTAINER = {
  role: 'region',
  'aria-label': 'Danh sách thi',
  tabIndex: 0,
  className: 'max-h-[min(32rem,70dvh)] overflow-auto',
} as const;

const STICKY_HEAD_RULE = 'shadow-[inset_0_-1px_0_hsl(var(--border))]';

export function SessionExamRosterCard({
  sessionId,
  canEdit,
  embedded = false,
}: {
  sessionId: string;
  canEdit: boolean;
  /** Bước stepper đã có heading riêng. */
  embedded?: boolean;
}) {
  const roster = useSessionRoster(sessionId);
  const addStudent = useAddSessionRosterStudent(sessionId);
  const removeStudent = useRemoveSessionRosterStudent(sessionId);
  const importRoster = useImportSessionRoster(sessionId);
  const setupDraft = useSetupDraftOptional();
  const setupDraftRef = useRef(setupDraft);
  setupDraftRef.current = setupDraft;
  const savedDialog = setupDraft?.draft?.rosterDialog;
  const pickedImportRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pickedImportRef.current) {
        setupDraftRef.current?.patchDraft({ rosterImportPending: true });
      }
    };
  }, []);

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(Boolean(savedDialog));
  const [importOpen, setImportOpen] = useState(false);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [removeMissing, setRemoveMissing] = useState(false);

  const students = roster.data?.students ?? [];
  const customized = roster.data?.customized ?? false;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.mssv.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [students, search]);

  const rows = sheets?.[sheetIndex]?.rows ?? null;
  const parsed = useMemo(
    () => (rows ? extractRoster(rows, mapping) : null),
    [rows, mapping],
  );
  const diff = useMemo(() => {
    if (!parsed || parsed.errors.length > 0) return null;
    return diffRoster(
      students.map((s) => ({ mssv: s.mssv, name: s.name })),
      parsed.students,
    );
  }, [parsed, students]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
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
      setMapping(suggestColumnMapping(read[0]?.rows ?? []));
      pickedImportRef.current = true;
      setupDraft?.patchDraft({ rosterImportPending: true });
    } catch (error) {
      setSheets(null);
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy dùng .xlsx rồi thử lại.',
      );
    }
  }

  function onConfirmImport() {
    if (!parsed || parsed.errors.length > 0) return;
    importRoster.mutate(
      { students: parsed.students, removeMissing },
      {
        onSuccess: (result) => {
          toast.success(
            `Đã cập nhật danh sách thi: thêm ${result.added}, cập nhật ${result.updated}` +
              (result.removed > 0 ? `, xoá ${result.removed}` : ''),
          );
          setImportOpen(false);
          setSheets(null);
          setFileName('');
          setRemoveMissing(false);
          pickedImportRef.current = false;
          setupDraft?.patchDraft({ rosterImportPending: undefined });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Không import được'),
      },
    );
  }

  function onAdd(payload: AddStudentPayload) {
    if ('studentId' in payload) {
      toast.error('Thêm từ catalog chưa hỗ trợ trên danh sách thi — nhập MSSV và họ tên.');
      return;
    }
    addStudent.mutate(
      { mssv: payload.mssv, name: payload.name },
      {
        onSuccess: () => {
          toast.success('Đã thêm sinh viên vào danh sách thi');
          setAddOpen(false);
          setupDraft?.patchDraft({ rosterDialog: undefined });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Không thêm được'),
      },
    );
  }

  function onRemove(mssv: string) {
    if (!confirm(`Gỡ ${mssv} khỏi danh sách thi của phiên này?`)) return;
    removeStudent.mutate(mssv, {
      onSuccess: () => toast.success('Đã gỡ khỏi danh sách thi'),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : 'Không gỡ được'),
    });
  }

  return (
    <Card data-animate>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          {embedded ? null : (
            <CardTitle className="flex items-center gap-2 text-h3">
              <Users className="h-5 w-5" aria-hidden="true" />
              Danh sách thi
            </CardTitle>
          )}
          <Badge variant={customized ? 'warning' : 'info'}>
            {customized ? 'Đã tùy chỉnh cho phiên' : 'Theo lớp'}
          </Badge>
        </div>
        <CardDescription>
          {customized
            ? 'Danh sách đã tách khỏi lớp — mở phiên sẽ chốt đúng danh sách dưới đây.'
            : 'Đang dùng danh sách lớp học phần. Mọi chỉnh sửa chỉ áp dụng cho phiên này.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {roster.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : roster.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {roster.error instanceof Error
                ? roster.error.message
                : 'Không tải được danh sách thi.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm họ tên hoặc MSSV"
                aria-label="Tìm họ tên hoặc MSSV trong danh sách thi"
                className="w-full sm:max-w-xs"
              />
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAddOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Thêm sinh viên
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setImportOpen(true);
                      setSheets(null);
                      setFileError(null);
                    }}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Tải file danh sách
                  </Button>
                </div>
              )}
            </div>

            {students.length === 0 ? (
              <p className="text-small text-muted-foreground">
                Chưa có sinh viên nào — hãy nhập roster lớp hoặc tải file / thêm tay tại đây.
              </p>
            ) : (
              <Table container={SCROLL_CONTAINER}>
                <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={STICKY_HEAD_RULE}>MSSV</TableHead>
                    <TableHead className={STICKY_HEAD_RULE}>Họ tên</TableHead>
                    <TableHead className={STICKY_HEAD_RULE}>Nguồn</TableHead>
                    {canEdit ? (
                      <TableHead className={`text-right ${STICKY_HEAD_RULE}`}>
                        <span className="sr-only">Gỡ</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.mssv} className="h-12">
                      <TableCell className="font-mono text-muted-foreground">
                        {row.mssv}
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-medium">{SOURCE_LABEL[row.source]}</TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Gỡ ${row.mssv}`}
                            disabled={removeStudent.isPending}
                            onClick={() => onRemove(row.mssv)}
                          >
                            <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-caption text-muted-foreground">
              {visible.length}/{students.length} sinh viên
            </p>
            {setupDraft?.draft?.rosterImportPending && !fileName ? (
              <p className="text-small text-warning-strong">
                File vừa chọn chưa được nhập.
              </p>
            ) : null}
          </>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm sinh viên vào danh sách thi</DialogTitle>
          </DialogHeader>
          <ManualAddStudentForm
            directoryLookup
            initialMssv={savedDialog?.fields.mssv ?? ''}
            initialName={savedDialog?.fields.name ?? ''}
            onDraftChange={(fields) => {
              if (!addOpen) return;
              const text = Object.values(fields).some((value) => value.trim() !== '');
              setupDraft?.patchDraft({
                rosterDialog: text ? { mode: 'add', fields } : undefined,
              });
            }}
            isPending={addStudent.isPending}
            errorMessage={
              addStudent.isError && addStudent.error instanceof Error
                ? addStudent.error.message
                : null
            }
            onAdd={onAdd}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setSheets(null);
            setFileName('');
            setFileError(null);
            setRemoveMissing(false);
          }
        }}
      >
        {/*
          ColumnMapper có bảng preview + 3 select — cần dialog rộng và
          thân cuộn được; max-w-lg cắt ngang và không overflow sẽ mất footer.
        */}
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-12 text-left">
            <DialogTitle>Tải file danh sách thi</DialogTitle>
            <DialogDescription>
              Chỉ áp dụng cho phiên này — không đổi danh sách lớp học phần. Chọn cột MSSV
              / họ tên sau khi chọn file .xlsx.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="session-roster-file">File Excel (.xlsx)</Label>
                <input
                  id="session-roster-file"
                  type="file"
                  accept=".xlsx"
                  className="block w-full text-small file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground hover:file:bg-primary-strong"
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
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
                  <Label htmlFor="session-roster-sheet">Sheet</Label>
                  <select
                    id="session-roster-sheet"
                    className="h-10 rounded-md border border-input bg-surface px-2 text-small"
                    value={sheetIndex}
                    onChange={(e) => {
                      const index = Number(e.target.value);
                      setSheetIndex(index);
                      setMapping(suggestColumnMapping(sheets[index]?.rows ?? []));
                      setRemoveMissing(false);
                    }}
                  >
                    {sheets.map((sheet, index) => (
                      <option key={sheet.name} value={index}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {rows && (
                <ColumnMapper rows={rows} mapping={mapping} onChange={setMapping} />
              )}
              {parsed && (
                <ImportReview
                  errors={parsed.errors}
                  diff={diff}
                  skipped={parsed.skipped}
                  studentCount={parsed.students.length}
                  removeMissing={removeMissing}
                  onRemoveMissingChange={setRemoveMissing}
                  scope="exam"
                />
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                pickedImportRef.current = false;
                setupDraft?.patchDraft({ rosterImportPending: undefined });
                setImportOpen(false);
              }}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              loading={importRoster.isPending}
              disabled={
                !parsed || parsed.errors.length > 0 || parsed.students.length === 0
              }
              onClick={onConfirmImport}
            >
              Xác nhận nhập
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
