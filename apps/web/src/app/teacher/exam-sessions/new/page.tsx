'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, CircleCheckBig, Copy, TriangleAlert } from 'lucide-react';
import { useCreateExamSession, useExamSessions } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  roomName: '',
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
  requiredFilenames: [{ value: '' }],
};

/** Các giá trị đã dùng, mỗi cách viết một lần, giữ nguyên thứ tự mới trước. */
function distinct(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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

// Moved from app/(exam-live)/exam-sessions/new (Phase 0 route rename).
//
// Phòng và học kỳ từng là hai danh sách thả xuống, nguồn GET /rooms và
// GET /semesters. Đợt thu hẹp master data bỏ cả hai bảng: giảng viên gõ
// thẳng, và ô nhập gợi ý lại chính những giá trị họ đã dùng.
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const classes = useTeachingClasses();
  // Chỉ để gợi ý. Một trang là đủ: cái cần là các cách viết GẦN ĐÂY của
  // chính giảng viên này, không phải toàn bộ lịch sử.
  const previous = useExamSessions({ page: 1, pageSize: 50 });
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedClass = classes.data?.find((c) => c.id === form.watch('classId'));

  // Đây là thứ bù lại phần lớn những gì mất khi phòng thành văn bản tự do:
  // phép chống trùng lịch phòng so khớp chuỗi CHÍNH XÁC, nên gõ lại đúng
  // cách viết cũ là điều duy nhất làm nó còn tác dụng. Cảnh báo sức chứa
  // thì biến mất cùng bảng `room` — không còn ai biết phòng có bao nhiêu máy.
  const previousRooms = useMemo(
    () => distinct((previous.data?.items ?? []).map((item) => item.roomName)),
    [previous.data],
  );
  const previousSemesters = useMemo(
    () => distinct((previous.data?.items ?? []).map((item) => item.semesterName)),
    [previous.data],
  );

  // Not an error: a session can be created and run without a roster. But
  // nobody will get in — agent:join requires an enrollment — and finding
  // that out at the start of the exam is the failure this warning prevents.
  const noRoster = selectedClass?.studentCount === 0;

  function onSubmit(values: CreateExamSessionFormValues) {
    createExamSession.mutate(
      {
        name: values.name,
        classId: values.classId,
        roomName: values.roomName,
        semesterName: values.semesterName,
        examType: values.examType,
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
        // Schema đã quy chuỗi rỗng về undefined, nên "không chọn rubric" đi
        // ra ngoài dây dưới dạng field vắng mặt — đúng cái DTO @IsOptional
        // của server chờ đợi.
        rubricId: values.rubricId,
        requiredFilenames: values.requiredFilenames.map((filename) => filename.value),
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
              <FormField
                id="exam-session-name"
                label="Tên phiên thi"
                error={form.formState.errors.name?.message}
              >
                <Input
                  id="exam-session-name"
                  placeholder="vd: Thi cuối kỳ Lập trình Web — nhóm 03"
                  invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name')}
                />
              </FormField>

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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={classes.isLoading || classes.isError}
                    >
                      <SelectTrigger id="exam-session-class">
                        <SelectValue
                          placeholder={classes.isLoading ? 'Đang tải…' : 'Chọn lớp thi'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.data?.map((klass) => (
                          <SelectItem key={klass.id} value={klass.id}>
                            {klass.courseName} — {klass.name} ({klass.studentCount} SV)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              </FormField>

              {!classes.isLoading && !classes.isError && classes.data?.length === 0 && (
                <Alert variant="info">
                  <AlertDescription>
                    Bạn chưa có lớp nào.{' '}
                    <Link href="/teacher/classes" className="font-semibold underline">
                      Tạo lớp
                    </Link>{' '}
                    rồi quay lại — một phiên thi luôn thuộc về một lớp.
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
                hint="Gõ đúng như những lần trước: phép chống trùng lịch phòng so khớp chính xác từng ký tự."
                error={form.formState.errors.roomName?.message}
              >
                <Input
                  id="exam-session-room"
                  list="exam-session-room-options"
                  placeholder="P.A101"
                  {...form.register('roomName')}
                />
                <datalist id="exam-session-room-options">
                  {previousRooms.map((room) => (
                    <option key={room} value={room} />
                  ))}
                </datalist>
              </FormField>

              <FormField
                id="exam-session-semester"
                label="Học kỳ"
                hint="Chụp lại vào phiên thi và không đổi về sau — bảng điểm lọc theo đúng chuỗi này."
                error={form.formState.errors.semesterName?.message}
              >
                <Input
                  id="exam-session-semester"
                  list="exam-session-semester-options"
                  placeholder="HK1 2026-2027"
                  {...form.register('semesterName')}
                />
                <datalist id="exam-session-semester-options">
                  {previousSemesters.map((semester) => (
                    <option key={semester} value={semester} />
                  ))}
                </datalist>
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
