'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, CircleCheckBig, Copy, Pencil, TriangleAlert } from 'lucide-react';
import { useCreateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { useRooms } from '@/hooks/useMasterData';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { RequiredFilenamesInput } from './_components/RequiredFilenamesInput';
import { RubricPicker } from './_components/RubricPicker';

import {
  createExamSessionSchema,
  describeCreateError,
  EXAM_TYPES,
  type CreateExamSessionFormValues,
} from './schema';

const EMPTY_FORM: CreateExamSessionFormValues = {
  name: '',
  classId: '',
  roomId: '',
  roomName: '',
  // Học kỳ suy từ lớp đã chọn — không còn ô chọn riêng.
  semesterId: '',
  semesterName: '',
  // Empty-string sentinel for "not yet chosen" (same as classId above),
  // even though it's outside the Zod enum's real output type — the
  // resolver still rejects submit until the user consciously picks one;
  // this cast only tells RHF what shape the default *starts* as.
  examType: '' as CreateExamSessionFormValues['examType'],
  startTime: '',
  endTime: '',
  // Cùng kiểu sentinel chuỗi rỗng như classId — schema quy nó về
  // undefined, vì "chưa chọn rubric" là hợp lệ chứ không phải uuid hỏng.
  rubricId: '',
  requiredFilenames: [{ value: '', deliverableType: 'document' }],
};

/** `Loại kỳ thi Môn MãLớp Học kỳ` — chỉ dựng khi đủ lớp (có HK) + loại kỳ. */
function buildSessionName(parts: {
  examType: string;
  courseName: string;
  className: string;
  semesterName: string;
}): string {
  const typeLabel = EXAM_TYPE_LABELS[parts.examType];
  if (!typeLabel || !parts.courseName || !parts.className || !parts.semesterName) {
    return '';
  }
  return `${typeLabel} ${parts.courseName} ${parts.className} ${parts.semesterName}`;
}

async function copySessionCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã "${code}"`);
  } catch {
    // Clipboard access can be denied (permissions, non-HTTPS context) —
    // the code is on screen at projector size anyway, so this is a
    // degraded-but-usable failure, not a dead end.
    toast.error('Không sao chép được — hãy đọc mã trực tiếp cho sinh viên.');
  }
}

/** Phòng: chỉ chọn từ catalog. Học kỳ lấy từ lớp thi đã chọn. */
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const classes = useTeachingClasses();
  const catalogRooms = useRooms({ page: 1, pageSize: 100, status: 'active' });
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  /** Sau khi chọn xong lớp + loại kỳ, cho phép sửa tên bằng biểu tượng bút. */
  const [nameEditable, setNameEditable] = useState(false);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: EMPTY_FORM,
  });

  const classId = form.watch('classId');
  const examType = form.watch('examType');

  const selectedClass = classes.data?.find((c) => c.id === classId);

  const classOptions = useMemo(
    () =>
      (classes.data ?? []).map((klass) => {
        const parts = [klass.courseName, klass.name, klass.semesterName].filter(Boolean);
        return {
          value: klass.id,
          label: parts.join(' · '),
          keywords: [klass.courseName, klass.name, klass.semesterName, String(klass.studentCount)]
            .filter(Boolean)
            .join(' '),
        };
      }),
    [classes.data],
  );

  const roomOptions = useMemo(
    () =>
      (catalogRooms.data?.items ?? []).map((room) => ({
        value: room.id,
        label: room.code ? `${room.name} (${room.code})` : room.name,
        keywords: [room.code, room.building, room.floor].filter(Boolean).join(' '),
      })),
    [catalogRooms.data],
  );

  const classSemesterName = selectedClass?.semesterName ?? '';
  const selectionComplete = Boolean(
    selectedClass &&
      classSemesterName &&
      examType &&
      EXAM_TYPE_LABELS[examType],
  );

  // Tự điền tên khi đủ lớp (kèm học kỳ) + loại kỳ; dừng ghi đè sau khi user mở sửa.
  useEffect(() => {
    if (nameEditable || !selectionComplete || !selectedClass) return;
    const next = buildSessionName({
      examType,
      courseName: selectedClass.courseName,
      className: selectedClass.name,
      semesterName: classSemesterName,
    });
    if (next && form.getValues('name') !== next) {
      form.setValue('name', next, { shouldValidate: true, shouldDirty: true });
    }
  }, [
    nameEditable,
    selectionComplete,
    selectedClass,
    classSemesterName,
    examType,
    form,
  ]);

  // Not an error: a session can be created and run without a roster. But
  // nobody will get in — agent:join requires an enrollment — and finding
  // that out at the start of the exam is the failure this warning prevents.
  const noRoster = selectedClass?.studentCount === 0;

  function onSubmit(values: CreateExamSessionFormValues) {
    createExamSession.mutate(
      {
        name: values.name,
        classId: values.classId,
        // Id thắng: chỉ gửi Id khi chọn catalog; nhập tay chỉ gửi text.
        ...(values.roomId
          ? { roomId: values.roomId }
          : { roomName: values.roomName?.trim() || undefined }),
        ...(values.semesterId
          ? { semesterId: values.semesterId }
          : { semesterName: values.semesterName?.trim() || undefined }),
        examType: values.examType,
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
        // Schema đã quy chuỗi rỗng về undefined, nên "không chọn rubric" đi
        // ra ngoài dây dưới dạng field vắng mặt — đúng cái DTO @IsOptional
        // của server chờ đợi.
        rubricId: values.rubricId,
        // Chỉ gửi `entries` khi khối "Kiểm file bên trong" thực sự có dòng
        // nào — bỏ hẳn key thay vì gửi mảng rỗng, khớp đúng luật DTO backend
        // "mảng rỗng/vắng mặt = không khai file bên trong" (spec §4.1).
        requiredFilenames: values.requiredFilenames.map((filename) => ({
          filename: filename.value,
          // Chỉ gửi khi khác mặc định — giữ tương thích ngược cho ca phổ
          // biến nhất (tài liệu, không ngôn ngữ) thay vì gửi field thừa.
          ...(filename.deliverableType !== 'document' ? { deliverableType: filename.deliverableType } : {}),
          ...(filename.language ? { language: filename.language } : {}),
          ...(filename.entries && filename.entries.length > 0
            ? { entries: filename.entries.map((entry) => entry.value) }
            : {}),
        })),
      },
      {
        onSuccess: (session) => setCreated({ id: session.id, code: session.code }),
      },
    );
  }

  if (created) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {/* Every error path below uses role="alert" — this is the
            equivalent for the success outcome, so a screen reader
            announces the newly created code instead of silence.
            role="status" (not "alert") since this isn't urgent or
            interrupting, just an important state change. */}
        <Card data-animate role="status" className="overflow-hidden">
          <div className="h-1 w-full bg-success" aria-hidden="true" />
          <CardHeader className="items-center text-center">
            <span className="icon-chip mb-1 h-12 w-12 rounded-full bg-success-subtle text-success-strong">
              <CircleCheckBig className="h-6 w-6" aria-hidden="true" />
            </span>
            <CardTitle>Đã tạo phiên thi</CardTitle>
            <CardDescription>
              Đọc mã này cho sinh viên hoặc chiếu lên máy chiếu để sinh viên tự nhập.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {/* Oversized with wide tracking on purpose — this is read off
                a projector from across a room, not scanned in a table. */}
            <p className="break-all text-center text-beacon text-primary">{created.code}</p>

            <Button type="button" variant="outline" size="sm" onClick={() => copySessionCode(created.code)}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Sao chép mã
            </Button>

            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href={`/exam-sessions/${created.id}`}>Vào phòng chờ</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Reset before clearing `created`, so the form that
                  // reappears is empty rather than still holding the
                  // session that was just created.
                  form.reset(EMPTY_FORM);
                  createExamSession.reset();
                  setNameEditable(false);
                  setCreated(null);
                }}
              >
                Tạo phiên thi khác
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Tạo phiên thi mới"
        description="Khai báo lớp, phòng, khung giờ và những file sinh viên bắt buộc phải nộp."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách phiên thi
            </Link>
          </Button>
        }
      />

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Card data-animate>
            <CardHeader>
              <CardTitle>Thông tin phiên thi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* The lecturer picks a CLASS, not a course. The course
                  follows from it server-side, and this list only ever holds
                  classes they were assigned — a class is what they actually
                  teach, and what the roster and the headcount hang off. */}
              <FormField
                id="exam-session-class"
                label="Lớp thi"
                error={
                  classes.isError ? undefined : form.formState.errors.classId?.message
                }
              >
                <Controller
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Học kỳ gắn với lớp — không còn ô chọn riêng.
                        const klass = classes.data?.find((c) => c.id === value);
                        form.setValue('semesterId', klass?.semesterId ?? '', {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                        form.setValue('semesterName', klass?.semesterName ?? '', {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                      }}
                      options={classOptions}
                      disabled={classes.isLoading || classes.isError}
                      placeholder={classes.isLoading ? 'Đang tải…' : 'Chọn lớp thi'}
                      searchPlaceholder="Gõ môn, mã lớp hoặc học kỳ…"
                      emptyText="Không tìm thấy lớp."
                      ariaLabel="Chọn lớp thi"
                    />
                  )}
                />
                {classes.isError && (
                  <p
                    role="alert"
                    className="flex items-center gap-1.5 text-small font-medium text-danger-strong"
                  >
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Không tải được danh sách lớp.
                    <button
                      type="button"
                      onClick={() => classes.refetch()}
                      className="rounded-sm underline underline-offset-2 hover:no-underline"
                    >
                      Thử lại
                    </button>
                  </p>
                )}
                {form.formState.errors.semesterName?.message && (
                  <p
                    role="alert"
                    className="flex items-center gap-1.5 text-small font-medium text-danger-strong"
                  >
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {form.formState.errors.semesterName.message}
                  </p>
                )}
              </FormField>

              {!classes.isLoading && !classes.isError && classes.data?.length === 0 && (
                <Alert variant="info">
                  <AlertDescription>
                    Bạn chưa có lớp nào.{' '}
                    <Link href="/teacher/classes" className="font-semibold underline">
                      Xem lớp của tôi
                    </Link>{' '}
                    — một phiên thi luôn thuộc về một lớp được phân công.
                  </AlertDescription>
                </Alert>
              )}

              {selectedClass && !selectedClass.semesterId && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    Lớp {selectedClass.name} chưa gắn học kỳ catalog — không tạo được phiên
                    thi. Liên hệ quản trị viên để cập nhật lớp.
                  </AlertDescription>
                </Alert>
              )}

              {noRoster && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    Lớp {selectedClass?.name} chưa có danh sách sinh viên. Bạn vẫn tạo được
                    phiên thi, nhưng chưa nhập danh sách thì không sinh viên nào vào được —
                    hãy nhập danh sách lớp trước.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                id="exam-session-room"
                label="Phòng thi"
                hint="Chọn từ danh mục. Snapshot tên phòng được chụp lúc tạo phiên."
                error={
                  form.formState.errors.roomId?.message ??
                  form.formState.errors.roomName?.message
                }
              >
                <Controller
                  control={form.control}
                  name="roomId"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      options={roomOptions}
                      disabled={catalogRooms.isLoading}
                      placeholder={
                        catalogRooms.isLoading
                          ? 'Đang tải phòng…'
                          : roomOptions.length
                            ? 'Chọn phòng'
                            : 'Chưa có phòng active trong danh mục'
                      }
                      searchPlaceholder="Gõ tên hoặc mã phòng…"
                      emptyText="Không tìm thấy phòng."
                      ariaLabel="Chọn phòng thi"
                    />
                  )}
                />
              </FormField>


              {/* Rubric thuộc về GIẢNG VIÊN từ đợt thu hẹp master data, nên
                  danh sách không còn phụ thuộc lớp đã chọn. */}
              <RubricPicker />


              <FormField
                id="exam-session-type"
                label="Loại kỳ thi"
                error={form.formState.errors.examType?.message}
              >
                <Controller
                  control={form.control}
                  name="examType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="exam-session-type">
                        <SelectValue placeholder="Chọn loại kỳ thi" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXAM_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {EXAM_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <FormField
                id="exam-session-name"
                label="Tên phiên thi"
                hint={
                  nameEditable
                    ? 'Bạn đang sửa tên thủ công.'
                    : selectionComplete
                      ? 'Tự suy từ loại kỳ thi, môn, mã lớp và học kỳ của lớp. Bấm biểu tượng để sửa.'
                      : 'Sẽ tự tạo khi chọn đủ lớp thi và loại kỳ thi.'
                }
                error={form.formState.errors.name?.message}
              >
                <div className="flex gap-2">
                  <Input
                    id="exam-session-name"
                    placeholder="vd: Cuối kỳ Lập trình Web WEB001 HK1 2026-2027"
                    invalid={Boolean(form.formState.errors.name)}
                    readOnly={!nameEditable}
                    className={!nameEditable ? 'bg-surface-2' : undefined}
                    {...form.register('name')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!selectionComplete}
                    aria-label="Sửa tên phiên thi"
                    title={
                      selectionComplete
                        ? 'Sửa tên phiên thi'
                        : 'Chọn đủ lớp thi và loại kỳ thi trước'
                    }
                    onClick={() => {
                      setNameEditable(true);
                      // Focus after unlock so the lecturer can type immediately.
                      requestAnimationFrame(() => {
                        document.getElementById('exam-session-name')?.focus();
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </FormField>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  id="exam-session-start-time"
                  label="Thời gian bắt đầu"
                  error={form.formState.errors.startTime?.message}
                >
                  <Input
                    id="exam-session-start-time"
                    type="datetime-local"
                    invalid={Boolean(form.formState.errors.startTime)}
                    {...form.register('startTime')}
                  />
                </FormField>

                <FormField
                  id="exam-session-end-time"
                  label="Thời gian kết thúc"
                  error={form.formState.errors.endTime?.message}
                >
                  <Input
                    id="exam-session-end-time"
                    type="datetime-local"
                    invalid={Boolean(form.formState.errors.endTime)}
                    {...form.register('endTime')}
                  />
                </FormField>
              </div>

              <RequiredFilenamesInput />

              {createExamSession.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {/* The server's message, not a guess at what went
                        wrong. A room or class clash names the booking
                        already holding the slot — the one thing that tells
                        the lecturer what to change. This banner used to
                        hardcode the duplicate-filename explanation, which
                        sent anyone hitting a clash to inspect their
                        filename list instead. */}
                    {describeCreateError(createExamSession.error)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/exam-sessions">Hủy</Link>
            </Button>
            <Button type="submit" size="lg" loading={createExamSession.isPending}>
              {createExamSession.isPending ? 'Đang tạo…' : 'Tạo phiên thi'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
