'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, CircleCheckBig, Copy, TriangleAlert } from 'lucide-react';
import { useCreateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { useRooms } from '@/hooks/useRooms';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { RequiredFilenamesInput } from './_components/RequiredFilenamesInput';

// Must stay byte-for-byte identical to FILENAME_TEMPLATE_REGEX in
// apps/api/src/exam-session/filename-template.ts. It is the old
// SAFE_FILENAME_REGEX plus the four tokens the server fills per student —
// the same character class and the same `(?!.*\.\.)` lookahead, so a
// pattern is held to exactly the path-traversal rules a literal name is. A
// mismatch here means the form accepts something the server 400s on.
const FILENAME_TEMPLATE_REGEX =
  /^(?!.*\.\.)(?:[A-Za-z0-9_.-]|\{(?:MSSV|TEN|PHONG|SOMAY)\})+$/;

const EXAM_TYPES = ['TK', 'GK', 'CK'] as const;

const createExamSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập tên phiên thi')
      .max(200, 'Tên phiên thi tối đa 200 ký tự'),
    classId: z.string().uuid('Vui lòng chọn lớp thi'),
    roomId: z.string().uuid('Vui lòng chọn phòng thi'),
    examType: z.enum(EXAM_TYPES, { message: 'Vui lòng chọn loại kỳ thi' }),
    // Bound to <input type="datetime-local">, so this is the browser's
    // "YYYY-MM-DDTHH:mm" local-time string, not ISO 8601 yet — converted to
    // a real ISO string in onSubmit before it reaches the API (the backend's
    // @IsISO8601() needs a full ISO string, e.g. with seconds + offset).
    startTime: z.string().min(1, 'Vui lòng chọn thời gian bắt đầu'),
    endTime: z.string().min(1, 'Vui lòng chọn thời gian kết thúc'),
    requiredFilenames: z
      .array(
        z.object({
          value: z
            .string()
            .trim()
            .min(1, 'Tên file không được để trống')
            .regex(
              FILENAME_TEMPLATE_REGEX,
              'Chỉ được dùng chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
            ),
        }),
      )
      .min(1, 'Cần khai báo ít nhất 1 file bắt buộc'),
  })
  .refine(
    (values) => {
      const start = new Date(values.startTime).getTime();
      const end = new Date(values.endTime).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    },
    {
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
      path: ['endTime'],
    },
  )
  // Mirrors the backend's @ArrayUnique() on requiredFilenames (see
  // create-exam-session.dto.ts) — without this, a duplicate filename
  // (a realistic typo: retyping the same name twice) passes every
  // per-field check here, reaches the API, and only then hits the DB's
  // unique index (uq_required_deliverable_session_filename), coming back
  // as a 409 the generic API-error banner can't explain. Catch it
  // client-side and point at exactly which entry is the duplicate.
  .refine(
    (values) => {
      const seen = new Set<string>();
      for (const filename of values.requiredFilenames) {
        if (seen.has(filename.value)) return false;
        seen.add(filename.value);
      }
      return true;
    },
    (values) => {
      const seen = new Set<string>();
      let duplicateIndex = -1;
      for (const [index, filename] of values.requiredFilenames.entries()) {
        if (seen.has(filename.value)) {
          duplicateIndex = index;
          break;
        }
        seen.add(filename.value);
      }
      const duplicateName = duplicateIndex === -1 ? '' : values.requiredFilenames[duplicateIndex].value;
      return {
        message: `Tên file "${duplicateName}" bị trùng — mỗi file bắt buộc phải có tên khác nhau.`,
        path:
          duplicateIndex === -1
            ? ['requiredFilenames']
            : ['requiredFilenames', duplicateIndex, 'value'],
      };
    },
  );

export type CreateExamSessionFormValues = z.infer<typeof createExamSessionSchema>;

const EMPTY_FORM: CreateExamSessionFormValues = {
  name: '',
  classId: '',
  roomId: '',
  // Empty-string sentinel for "not yet chosen" (same as classId/roomId
  // above), even though it's outside the Zod enum's real output type — the
  // resolver still rejects submit until the user consciously picks one;
  // this cast only tells RHF what shape the default *starts* as.
  examType: '' as CreateExamSessionFormValues['examType'],
  startTime: '',
  endTime: '',
  requiredFilenames: [{ value: '' }],
};

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

// Moved from app/(exam-live)/exam-sessions/new (Phase 0 route rename). P3
// fields (Course/Room/Exam-type) added in Phase 2 once GET /courses and
// GET /rooms existed.
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const classes = useTeachingClasses();
  const rooms = useRooms();
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedClass = classes.data?.find((c) => c.id === form.watch('classId'));
  const selectedRoom = rooms.data?.find((r) => r.id === form.watch('roomId'));
  // Non-blocking on purpose (see RoomEntity.capacity's own comment) —
  // teachers may have valid reasons for a mismatch (partial attendance,
  // overflow handled elsewhere). Counted against the CLASS now, not the
  // course: a course's enrollment spans every class in it, so comparing it
  // to one lab's machine count was warning about nothing real.
  const capacityWarning =
    selectedClass &&
    selectedRoom &&
    selectedRoom.capacity !== null &&
    selectedRoom.capacity < selectedClass.studentCount
      ? `Phòng "${selectedRoom.name}" có ${selectedRoom.capacity} máy nhưng lớp "${selectedClass.name}" có ${selectedClass.studentCount} sinh viên.`
      : null;

  // Not an error: a session can be created and run without a roster. But
  // nobody will get in — agent:join requires an enrollment — and finding
  // that out at the start of the exam is the failure this warning prevents.
  const noRoster = selectedClass?.studentCount === 0;

  function onSubmit(values: CreateExamSessionFormValues) {
    createExamSession.mutate(
      {
        name: values.name,
        classId: values.classId,
        roomId: values.roomId,
        examType: values.examType,
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
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
                            {klass.courseCode} — {klass.name} ({klass.studentCount} SV)
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
                    Bạn chưa được giao lớp nào. Trưởng khoa là người tạo lớp và phân công
                    giảng viên — hãy liên hệ trước khi tạo phiên thi.
                  </AlertDescription>
                </Alert>
              )}

              {noRoster && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    Lớp {selectedClass?.name} chưa có danh sách sinh viên. Bạn vẫn tạo được
                    phiên thi, nhưng chưa nhập danh sách thì không sinh viên nào vào được —
                    hãy nhờ Trưởng khoa nhập danh sách lớp trước.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                id="exam-session-room"
                label="Phòng thi"
                error={rooms.isError ? undefined : form.formState.errors.roomId?.message}
              >
                <Controller
                  control={form.control}
                  name="roomId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={rooms.isLoading || rooms.isError}
                    >
                      <SelectTrigger id="exam-session-room">
                        <SelectValue
                          placeholder={rooms.isLoading ? 'Đang tải…' : 'Chọn phòng thi'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.data?.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name}
                            {room.capacity !== null ? ` (${room.capacity} máy)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {rooms.isError && (
                  <p
                    role="alert"
                    className="flex items-center gap-1.5 text-small font-medium text-danger-strong"
                  >
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Không tải được danh sách phòng thi.
                    <button
                      type="button"
                      onClick={() => rooms.refetch()}
                      className="rounded-sm underline underline-offset-2 hover:no-underline"
                    >
                      Thử lại
                    </button>
                  </p>
                )}
              </FormField>

              {capacityWarning && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>{capacityWarning}</AlertDescription>
                </Alert>
              )}

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
                    {/* A retry can never succeed for a duplicate-filename
                        409 — the client-side .refine() above should catch
                        that before submit, but this is the fallback for
                        anything that still reaches the API (a race, or a
                        bypass), so it points at a real, checkable cause
                        instead of blindly suggesting "thử lại". */}
                    Không tạo được phiên thi. Vui lòng kiểm tra danh sách file bắt buộc có bị
                    trùng tên không, sau đó thử lại.
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
