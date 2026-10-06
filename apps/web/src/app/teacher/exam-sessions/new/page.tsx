'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, CircleCheckBig, Copy, TriangleAlert } from 'lucide-react';
import { useCreateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { semesterTextOf } from '@/lib/master-data-forms';
import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
} from '../_components/session-fields';
import { RequiredFilenamesInput } from './_components/RequiredFilenamesInput';
import { RubricPicker } from './_components/RubricPicker';
import {
  createExamSessionSchema,
  describeCreateError,
  type CreateExamSessionFormValues,
} from './schema';

const EMPTY_FORM: CreateExamSessionFormValues = {
  name: '',
  classId: '',
  roomId: '',
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
// Từ đợt khôi phục master data: PHÒNG chọn từ danh sách phòng đang hoạt động (không còn gõ chữ), HỌC KỲ chỉ để xem — lấy từ lớp, server chụp
// chữ vào phiên. Các ô chung với trang sửa nằm ở `../_components/session-fields`.
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const classes = useTeachingClasses();
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedClass = classes.data?.find((c) => c.id === form.watch('classId'));

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
              <SessionNameField />

              {/* The lecturer picks a CLASS, not a course. The course
                  follows from it server-side, and this list only ever holds
                  classes they were assigned — a class is what they actually
                  teach, and what the roster and the headcount hang off.
                  Nhãn gộp CÓ học kỳ: cùng một lớp học ở hai kỳ là hai lớp. */}
              <FormField
                id="exam-session-class"
                label="Lớp thi"
                error={classes.isError ? undefined : form.formState.errors.classId?.message}
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
                        <SelectValue placeholder={classes.isLoading ? 'Đang tải…' : 'Chọn lớp thi'} />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.data?.map((klass) => (
                          <SelectItem key={klass.id} value={klass.id}>
                            {klass.labelWithSemester} ({klass.studentCount} SV)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {classes.isError && (
                  <p role="alert" className="flex items-center gap-1.5 text-small font-medium text-danger-strong">
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
                    Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi.
                  </AlertDescription>
                </Alert>
              )}

              {noRoster && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    Lớp {selectedClass?.label} chưa có danh sách sinh viên. Bạn vẫn tạo được
                    phiên thi, nhưng chưa nhập danh sách thì không sinh viên nào vào được —
                    hãy nhập danh sách lớp trước.
                  </AlertDescription>
                </Alert>
              )}

              <SessionSemesterReadout
                text={selectedClass ? semesterTextOf(selectedClass) : 'Chọn lớp để xem học kỳ'}
              />

              <SessionRoomField />

              {/* Rubric thuộc về GIẢNG VIÊN từ đợt thu hẹp master data, nên
                  danh sách không còn phụ thuộc lớp đã chọn. */}
              <RubricPicker />

              <SessionExamTypeField />

              <SessionTimeFields />

              <RequiredFilenamesInput />

              {createExamSession.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {/* The server's message, not a guess at what went
                        wrong. A room or class clash names the booking
                        already holding the slot — the one thing that tells
                        the lecturer what to change. */}
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
