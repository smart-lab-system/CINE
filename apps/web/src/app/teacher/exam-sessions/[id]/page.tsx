'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  DoorOpen,
  GraduationCap,
  Settings2,
  XCircle,
} from 'lucide-react';
import {
  useCancelExamSession,
  useExamMaterials,
  useExamSessionDetail,
  useOpenSession,
  useUpdateExamSessionSchedule,
} from '@/hooks/useExamSession';
import { useRooms } from '@/hooks/useMasterData';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  EXAM_TYPE_LABELS,
  getDisplaySessionStatus,
} from '@/lib/exam-session-display';
import { ExamMaterialsCard } from '@/app/(exam-live)/exam-sessions/[id]/_components/ExamMaterialsCard';
import { RubricRow } from '@/app/teacher/grading/_components/RubricRow';
import { SetupChecklist, evaluateSetupChecklist } from './_components/SetupChecklist';
import { RequiredDeliverablesEditor } from './_components/RequiredDeliverablesEditor';
import { ExamFolderPreview } from './_components/ExamFolderPreview';
import { SessionExamRosterCard } from './_components/SessionExamRosterCard';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function copySessionCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã "${code}"`);
  } catch {
    toast.error('Không sao chép được — hãy đọc mã trực tiếp.');
  }
}

/**
 * Hub Thiết lập phiên — shell teacher (spec 2026-10-18).
 * Không thay màn vận hành live tại `/exam-sessions/[id]`.
 */
export default function ExamSessionSetupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detail = useExamSessionDetail(id);
  const materials = useExamMaterials(id);
  const classes = useTeachingClasses();
  const catalogRooms = useRooms({ page: 1, pageSize: 100, status: 'active' });
  const updateSchedule = useUpdateExamSessionSchedule();
  const openSession = useOpenSession(id);
  const cancelSession = useCancelExamSession();

  const session = detail.data;
  const mutable = session?.status === 'scheduled';

  const [roomId, setRoomId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');

  useEffect(() => {
    if (!session) return;
    setRoomId(session.roomId ?? '');
    setStartLocal(toLocalInputValue(session.startTime));
    setEndLocal(toLocalInputValue(session.endTime));
  }, [session]);

  const studentCount = useMemo(() => {
    if (!session || !classes.data) return null;
    return classes.data.find((c) => c.id === session.classId)?.studentCount ?? null;
  }, [session, classes.data]);

  const roomOptions = useMemo(
    () =>
      (catalogRooms.data?.items ?? []).map((room) => ({
        value: room.id,
        label: room.code ? `${room.name} (${room.code})` : room.name,
        keywords: [room.code, room.building, room.floor].filter(Boolean).join(' '),
      })),
    [catalogRooms.data],
  );

  const checklist = useMemo(() => {
    if (!session) return null;
    return evaluateSetupChecklist({
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      studentCount,
      materialCount: materials.data?.length ?? null,
      hasRubric: Boolean(session.rubricId),
      deliverableCount: session.requiredDeliverables.length,
    });
  }, [session, studentCount, materials.data]);

  if (detail.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detail.isError || !session) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>
            {detail.error instanceof Error
              ? detail.error.message
              : 'Không tải được phiên thi.'}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/teacher/exam-sessions">Quay lại danh sách</Link>
        </Button>
      </div>
    );
  }

  const display = getDisplaySessionStatus(
    session.status,
    session.startTime,
    session.endTime,
  );
  const klass = classes.data?.find((c) => c.id === session.classId);

  function saveSchedule() {
    if (!session) return;
    updateSchedule.mutate(
      {
        id: session.id,
        body: {
          roomId: roomId || undefined,
          startTime: new Date(startLocal).toISOString(),
          endTime: new Date(endLocal).toISOString(),
        },
      },
      {
        onSuccess: () => toast.success('Đã cập nhật phòng / khung giờ'),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Không lưu được lịch'),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        title="Thiết lập phiên thi"
        description="Chuẩn bị ca thi trước khi mở cửa cho sinh viên."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách
            </Link>
          </Button>
        }
      />

      <Card data-animate>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-h2">Thông tin phiên</CardTitle>
            <Badge variant={display.variant}>{display.label}</Badge>
          </div>
          <CardDescription>{session.name}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 text-small sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Mã phiên</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => copySessionCode(session.code)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-body font-semibold tracking-[0.12em] text-primary"
                  aria-label={`Sao chép mã ${session.code}`}
                >
                  {session.code}
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Môn học</dt>
              <dd className="text-foreground">{session.courseName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lớp</dt>
              <dd className="text-foreground">{klass?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Loại kỳ</dt>
              <dd className="text-foreground">
                {EXAM_TYPE_LABELS[session.examType] ?? session.examType}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Học kỳ</dt>
              <dd className="text-foreground">{session.semesterName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phòng thi</dt>
              <dd className="text-foreground">{session.roomName}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Thời gian</dt>
              <dd className="text-foreground">
                {formatDateTime(session.startTime)} → {formatDateTime(session.endTime)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline" size="sm">
            <Link href={`/exam-sessions/${session.id}`}>
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
              Vận hành phiên thi
            </Link>
          </Button>
          {(session.status === 'collecting' || session.status === 'completed') && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/teacher/submissions">
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  Quản lý bài thu
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/teacher/grading?sessionId=${session.id}`}>
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                  Chuẩn bị chấm
                </Link>
              </Button>
            </>
          )}
          {mutable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={cancelSession.isPending}
              onClick={() => {
                if (!confirm(`Huỷ phiên "${session.name}"?`)) return;
                cancelSession.mutate(session.id, {
                  onSuccess: () => {
                    toast.success('Đã huỷ phiên');
                  },
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : 'Huỷ thất bại'),
                });
              }}
            >
              <XCircle className="h-4 w-4 text-danger-strong" aria-hidden="true" />
              Huỷ phiên
            </Button>
          )}
          </div>
        </CardContent>
      </Card>

      {mutable && checklist && (
        <Card data-animate>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-h3">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
              Sẵn sàng mở
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SetupChecklist result={checklist} />
            <Button
              type="button"
              disabled={!checklist.canOpen || openSession.isPending}
              loading={openSession.isPending}
              onClick={() =>
                openSession.mutate(undefined, {
                  onSuccess: () => toast.success('Đã mở phiên thi'),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : 'Mở phiên thất bại'),
                })
              }
            >
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
              Mở phiên thi
            </Button>
          </CardContent>
        </Card>
      )}

      <Card data-animate>
        <CardHeader>
          <CardTitle className="text-h3">Lịch & phòng</CardTitle>
          <CardDescription>
            {mutable
              ? 'Chỉ sửa được trước khi mở phiên.'
              : 'Đã khóa — phiên đã mở hoặc đã kết thúc.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField id="setup-room" label="Phòng thi">
            <SearchableSelect
              value={roomId}
              onValueChange={setRoomId}
              options={roomOptions}
              placeholder={catalogRooms.isLoading ? 'Đang tải…' : 'Chọn phòng'}
              disabled={!mutable || catalogRooms.isLoading}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="setup-start" label="Bắt đầu">
              <Input
                id="setup-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                disabled={!mutable}
              />
            </FormField>
            <FormField id="setup-end" label="Kết thúc">
              <Input
                id="setup-end"
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                disabled={!mutable}
              />
            </FormField>
          </div>
          {mutable && (
            <div className="flex justify-end">
              <Button
                type="button"
                loading={updateSchedule.isPending}
                disabled={!roomId || !startLocal || !endLocal}
                onClick={saveSchedule}
              >
                Lưu lịch
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <SessionExamRosterCard sessionId={session.id} canEdit={mutable} />

      <ExamMaterialsCard
        examSessionId={session.id}
        releaseAt={formatDateTime(session.startTime)}
        canEdit={mutable || session.status === 'active'}
      />

      <Card data-animate>
        <CardHeader>
          <CardTitle className="text-h3">Cấu hình thư mục bài thi</CardTitle>
          <CardDescription>
            {mutable
              ? 'Cấu hình file SV phải nộp trên máy; xem preview bên dưới để đối chiếu với đề/hướng dẫn đã upload. Có thể sửa khi còn Sắp diễn ra.'
              : 'Thư mục bài thi đã khoá sau khi mở phiên.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mutable ? (
            <RequiredDeliverablesEditor
              sessionId={session.id}
              deliverables={session.requiredDeliverables}
              materialFilenames={(materials.data ?? []).map((m) => m.fileName)}
            />
          ) : (
            <ExamFolderPreview
              materialFilenames={(materials.data ?? []).map((m) => m.fileName)}
              requiredFiles={session.requiredDeliverables.map((d) => ({
                pattern: d.requiredFilename,
                deliverableType: d.deliverableType,
                language: d.language,
                entries: d.entries,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card data-animate>
        <CardHeader>
          <CardTitle className="text-h3">Rubric ca thi</CardTitle>
          <CardDescription>Gắn sớm tại đây — không bắt buộc trước khi mở phiên.</CardDescription>
        </CardHeader>
        <CardContent>
          <RubricRow sessionId={session.id} rubricId={session.rubricId} />
        </CardContent>
      </Card>
    </div>
  );
}
