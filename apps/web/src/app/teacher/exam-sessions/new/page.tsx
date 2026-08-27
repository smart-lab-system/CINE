'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TriangleAlert } from 'lucide-react';
import { useCreateExamSession } from '@/hooks/useExamSession';
import { useCourses } from '@/hooks/useCourses';
import { useRooms } from '@/hooks/useRooms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { RequiredFilenamesInput } from './_components/RequiredFilenamesInput';

// Must stay byte-for-byte identical to SAFE_FILENAME_REGEX in
// apps/api/src/exam-session/dto/create-exam-session.dto.ts. The character
// class alone already rejects "/" and "\" (path separators aren't in the
// allowed set); the `(?!.*\.\.)` lookahead additionally rejects a literal
// ".." even though "." and "." are each individually allowed characters.
// A mismatch here means the form accepts something the server 400s on.
const SAFE_FILENAME_REGEX = /^(?!.*\.\.)[A-Za-z0-9_.-]+$/;

const EXAM_TYPES = ['TK', 'GK', 'CK'] as const;

const createExamSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập tên phiên thi')
      .max(200, 'Tên phiên thi tối đa 200 ký tự'),
    courseId: z.string().uuid('Vui lòng chọn môn thi'),
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
              SAFE_FILENAME_REGEX,
              'Tên file chỉ được chứa chữ, số, "_", "-", "." và không được chứa ".."',
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

// Moved from app/(exam-live)/exam-sessions/new (Phase 0 route rename). P3
// fields (Course/Room/Exam-type) added in Phase 2 once GET /courses and
// GET /rooms existed.
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const courses = useCourses();
  const rooms = useRooms();
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: {
      name: '',
      courseId: '',
      roomId: '',
      // Empty-string sentinel for "not yet chosen" (same as courseId/
      // roomId above), even though it's outside the Zod enum's real
      // output type — the resolver still rejects submit until the user
      // consciously picks one; this cast only tells RHF what shape the
      // default *starts* as.
      examType: '' as CreateExamSessionFormValues['examType'],
      startTime: '',
      endTime: '',
      requiredFilenames: [{ value: '' }],
    },
  });

  const selectedCourse = courses.data?.find((c) => c.id === form.watch('courseId'));
  const selectedRoom = rooms.data?.find((r) => r.id === form.watch('roomId'));
  // Non-blocking on purpose (see RoomEntity.capacity's own comment) —
  // teachers may have valid reasons for a mismatch (partial class
  // attendance, overflow handled elsewhere).
  const capacityWarning =
    selectedCourse &&
    selectedRoom &&
    selectedRoom.capacity !== null &&
    selectedRoom.capacity < selectedCourse.enrollmentCount
      ? `Phòng "${selectedRoom.name}" có sức chứa ${selectedRoom.capacity} máy nhưng lớp "${selectedCourse.name}" có ${selectedCourse.enrollmentCount} sinh viên.`
      : null;

  function onSubmit(values: CreateExamSessionFormValues) {
    createExamSession.mutate(
      {
        name: values.name,
        courseId: values.courseId,
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
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
        {/* Every error path above uses role="alert" — this is the equivalent
            for the success outcome (a11y requirement in the plan's Global
            Constraints applies to loading/error states; extended here to
            success so a screen reader announces the newly created code
            instead of silence). role="status" (not "alert") since this
            isn't urgent/interrupting, just an important state change. */}
        <Card className="w-full" role="status">
          <CardHeader>
            <CardTitle>Đã tạo phiên thi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              Đọc mã này cho sinh viên hoặc chiếu lên máy chiếu để sinh viên tự nhập:
            </p>
            {/* Large + wide letter-spacing on purpose — this is read off a
                projector from across a room, not scanned in a table. */}
            <p className="text-6xl font-bold tracking-[0.3em]">{created.code}</p>
            <Link
              href={`/exam-sessions/${created.id}`}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Vào phòng chờ phiên thi
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Tạo phiên thi mới</h1>

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-name">Tên phiên thi</Label>
                <Input id="exam-session-name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-course">Môn thi</Label>
                <Controller
                  control={form.control}
                  name="courseId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={courses.isLoading || courses.isError}
                    >
                      <SelectTrigger id="exam-session-course">
                        <SelectValue
                          placeholder={courses.isLoading ? 'Đang tải…' : 'Chọn môn thi'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.data?.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.code} — {course.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {courses.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Không tải được danh sách môn thi.{' '}
                    <button
                      type="button"
                      onClick={() => courses.refetch()}
                      className="underline underline-offset-2"
                    >
                      Thử lại
                    </button>
                  </p>
                ) : (
                  form.formState.errors.courseId && (
                    <p role="alert" className="text-sm text-destructive">
                      {form.formState.errors.courseId.message}
                    </p>
                  )
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-room">Phòng thi</Label>
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
                {rooms.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Không tải được danh sách phòng thi.{' '}
                    <button
                      type="button"
                      onClick={() => rooms.refetch()}
                      className="underline underline-offset-2"
                    >
                      Thử lại
                    </button>
                  </p>
                ) : (
                  form.formState.errors.roomId && (
                    <p role="alert" className="text-sm text-destructive">
                      {form.formState.errors.roomId.message}
                    </p>
                  )
                )}
              </div>

              {capacityWarning && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>{capacityWarning}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-type">Loại kỳ thi</Label>
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
                {form.formState.errors.examType && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.examType.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-start-time">Thời gian bắt đầu</Label>
                <Input
                  id="exam-session-start-time"
                  type="datetime-local"
                  {...form.register('startTime')}
                />
                {form.formState.errors.startTime && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.startTime.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exam-session-end-time">Thời gian kết thúc</Label>
                <Input
                  id="exam-session-end-time"
                  type="datetime-local"
                  {...form.register('endTime')}
                />
                {form.formState.errors.endTime && (
                  <p role="alert" className="text-sm text-destructive">
                    {form.formState.errors.endTime.message}
                  </p>
                )}
              </div>

              <RequiredFilenamesInput />

              {createExamSession.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {/* A retry can never succeed for a duplicate-filename 409 — the
                      client-side .refine() above should already catch that case
                      before submit, but this is the fallback for anything that
                      still reaches the API (e.g. a race, or a bypass), so it must
                      point at a real, checkable cause instead of blindly
                      suggesting "thử lại". */}
                  Không tạo được phiên thi. Vui lòng kiểm tra danh sách file bắt buộc
                  có bị trùng tên không, sau đó thử lại.
                </p>
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={createExamSession.isPending}>
            {createExamSession.isPending ? 'Đang tạo…' : 'Tạo phiên thi'}
          </Button>
        </form>
      </FormProvider>
    </div>
  );
}
