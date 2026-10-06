'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useExamSessionDetail, useUpdateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExamSessionResponse, RequiredDeliverableResponse } from '@/lib/api/exam-session';
import { editAvailability } from '@/lib/exam-session-actions';
import { editFormValuesOf, editPayload } from '@/lib/exam-session-form';
import { semesterTextOf } from '@/lib/master-data-forms';
import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
} from '../../_components/session-fields';
import {
  describeUpdateError,
  editExamSessionSchema,
  type EditExamSessionFormValues,
} from '../../new/schema';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Sửa phiên thi"
        description="Chỉ đổi được tên, phòng, giờ và loại kỳ thi — và chỉ trước giờ bắt đầu."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách phiên thi
            </Link>
          </Button>
        }
      />
      {children}
    </div>
  );
}

/**
 * Danh sách file bắt buộc nộp, CHỈ ĐỌC. Khai lại file bắt buộc sau khi phiên đã tạo làm lệch những gì sinh viên đã được hướng dẫn nộp, và máy chủ
 * không có đường sửa nó (plan F) — sai file bắt buộc thì huỷ phiên và tạo lại.
 */
function LockedDeliverables({ items }: { items: RequiredDeliverableResponse[] }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/60 p-4">
      <legend className="px-1 text-body font-semibold text-foreground">File bắt buộc nộp</legend>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="font-mono text-small">
            <span>{item.requiredFilename}</span>
            {item.entries.length > 0 && (
              <span className="text-muted-foreground"> — file bên trong: {item.entries.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-small text-muted-foreground">Không đổi được. Sai file bắt buộc thì huỷ phiên và tạo lại.</p>
    </fieldset>
  );
}

function EditForm({ session }: { session: ExamSessionResponse }) {
  const router = useRouter();
  const update = useUpdateExamSession();
  const classes = useTeachingClasses();
  const klass = classes.data?.find((item) => item.id === session.classId);
  const [noChange, setNoChange] = useState(false);

  const form = useForm<EditExamSessionFormValues>({
    resolver: zodResolver(editExamSessionSchema),
    defaultValues: editFormValuesOf(session),
  });

  // Phòng hiện tại luôn là một lựa chọn (kể cả khi admin đã ngừng dùng nó) để sửa tên hay giờ không buộc phải đổi phòng.
  const keep = session.roomId ? { id: session.roomId, name: session.roomName } : null;

  function onSubmit(values: EditExamSessionFormValues) {
    const body = editPayload(session, values);
    // Gửi một thân rỗng chỉ để nhận về 200 không ghi gì là một vòng mạng vô ích, và không có gì để báo thành công.
    if (Object.keys(body).length === 0) {
      setNoChange(true);
      return;
    }
    setNoChange(false);
    update.mutate(
      { id: session.id, body },
      {
        onSuccess: () => {
          toast.success('Đã lưu thay đổi.');
          router.push('/teacher/exam-sessions');
        },
      },
    );
  }

  return (
    <Shell>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Card data-animate>
            <CardHeader>
              <CardTitle>Thông tin phiên thi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <SessionNameField />

              <FormField id="exam-session-class" label="Lớp thi" hint="Không đổi được. Sai lớp thì huỷ phiên và tạo lại.">
                <Input
                  id="exam-session-class"
                  value={klass?.labelWithSemester ?? session.classLabel ?? '—'}
                  readOnly
                  aria-readonly="true"
                />
              </FormField>

              {klass && <SessionSemesterReadout text={semesterTextOf(klass)} />}

              {session.roomId === null && (
                <Alert variant="info">
                  <Info />
                  <AlertDescription>
                    Phiên này được tạo trước khi có danh mục phòng nên chưa gắn phòng trong danh sách. Bạn vẫn sửa được tên
                    và loại kỳ thi; muốn đổi giờ thì hãy chọn phòng.
                  </AlertDescription>
                </Alert>
              )}

              <SessionRoomField keep={keep} />

              <SessionExamTypeField />

              <SessionTimeFields />

              <LockedDeliverables items={session.requiredDeliverables} />

              {noChange && (
                <Alert variant="info" role="status">
                  <AlertDescription>Không có thay đổi nào.</AlertDescription>
                </Alert>
              )}

              {update.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {/* Câu của server, không phải một lời đoán: cửa sổ sửa đã đóng, hay phòng/lớp/giãn cách va chạm với phiên nào. */}
                    {describeUpdateError(update.error)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/exam-sessions">Hủy</Link>
            </Button>
            <Button type="submit" size="lg" loading={update.isPending}>
              {update.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </Shell>
  );
}

/**
 * Trang sửa phiên (spec §4.1, phương án A): chỉ trước giờ bắt đầu. Mở thẳng bằng URL cho một phiên đã bắt đầu, đã huỷ, của người khác (403) hay không
 * tồn tại (404) thì KHÔNG dựng form — cùng `editAvailability` với nút ở danh sách, nên lý do giống nhau ở cả hai nơi. Server vẫn là thẩm quyền
 * cuối: một phiên vừa qua giờ bắt đầu giữa lúc trang mở và lúc bấm "Lưu" bị từ chối ở API và câu 409 hiện ngay trên form.
 */
export default function EditExamSessionPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useExamSessionDetail(id);

  if (detail.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Chỉ chặn khi CHƯA có dữ liệu (404/403 ở lần tải đầu). Một lần tải lại thất bại sau đó (TanStack tải lại khi quay về tab) để lại `isError` cùng dữ liệu
  // cũ; thay form bằng thông báo lúc ấy là vứt phần giảng viên đang gõ dở, trong khi dữ liệu để sửa vẫn còn đó và máy chủ vẫn là thẩm quyền cuối khi Lưu.
  if (!detail.data) {
    return (
      <Shell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            Không tải được phiên thi. Phiên không tồn tại hoặc không phải của bạn.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const availability = editAvailability(detail.data, Date.now());
  if (!availability.allowed) {
    return (
      <Shell>
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{availability.reason}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href={`/exam-sessions/${detail.data.id}`}>Về phòng chờ</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return <EditForm session={detail.data} />;
}
