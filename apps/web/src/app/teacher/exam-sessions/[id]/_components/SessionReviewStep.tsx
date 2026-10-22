'use client';

import { useEffect, useRef } from 'react';
import { DoorOpen } from 'lucide-react';
import type { ReplaceRequiredDeliverablesFormValues } from '@/app/teacher/exam-sessions/new/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSessionRoster } from '@/hooks/useExamSession';
import { useRubrics } from '@/hooks/useGrading';
import type { ExamSessionResponse } from '@/lib/api/exam-session';
import {
  EXAM_SESSION_STATUS_BADGE_CLASS,
  EXAM_TYPE_LABELS,
  getDisplaySessionStatus,
} from '@/lib/exam-session-display';
import { useStatusClock } from '@/lib/use-status-clock';
import { ExamFolderPreview } from './ExamFolderPreview';
import { SetupChecklist, type SetupChecklistResult } from './SetupChecklist';
import type { SetupInfoDraft } from './setup-draft';

function showLocal(value: string): string {
  if (!value) return '—';
  return value.replace('T', ' ');
}

export function SessionReviewStep({
  sessionId,
  session,
  className,
  roomLabel,
  info,
  materialFilenames,
  folder,
  rubricId,
  mutable,
  checklist,
  openPending,
  onOpen,
}: {
  sessionId: string;
  session: ExamSessionResponse;
  className: string | null;
  roomLabel: string;
  info: SetupInfoDraft;
  materialFilenames: string[];
  folder: ReplaceRequiredDeliverablesFormValues;
  rubricId: string | null;
  mutable: boolean;
  checklist: SetupChecklistResult | null;
  openPending: boolean;
  onOpen: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const roster = useSessionRoster(sessionId);
  const rubrics = useRubrics();
  const statusNow = useStatusClock([session]);
  const display = getDisplaySessionStatus(
    session.status,
    session.startTime,
    session.endTime,
    statusNow,
  );
  const rubricName = rubrics.data?.find((item) => item.id === rubricId)?.name ?? null;
  const students = roster.data?.students ?? [];
  const requiredFiles = (folder.requiredFilenames ?? []).map((file) => ({
    pattern: file.value ?? '',
    deliverableType: file.deliverableType ?? 'document',
    language: file.language ?? null,
    entries: (file.entries ?? []).map((entry) => entry.value).filter((value) => value.trim().length > 0),
  }));

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
          Xác nhận
        </h2>
        <p className="text-base text-muted-foreground">
          Toàn bộ thiết lập của phiên. Bước này chỉ để xem, không sửa được.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3">Thông tin chung</h3>
        <dl className="grid gap-4 text-base sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd className="mt-1">
              <Badge variant={display.variant} className={EXAM_SESSION_STATUS_BADGE_CLASS}>
                {display.label}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mã phiên</dt>
            <dd className="font-mono text-lg font-semibold tracking-[0.12em] text-foreground">
              {session.code}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Môn học</dt>
            <dd className="text-lg font-medium text-foreground">{session.courseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lớp</dt>
            <dd className="text-lg font-medium text-foreground">{className ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Học kỳ</dt>
            <dd className="text-lg font-medium text-foreground">{session.semesterName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Loại thi</dt>
            <dd className="text-lg font-medium text-foreground">{EXAM_TYPE_LABELS[info.examType] ?? info.examType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bắt đầu</dt>
            <dd className="text-lg font-medium text-foreground">{showLocal(info.startLocal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kết thúc</dt>
            <dd className="text-lg font-medium text-foreground">{showLocal(info.endLocal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phòng thi</dt>
            <dd className="text-lg font-medium text-foreground">{roomLabel || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3">Danh sách thi</h3>
        {roster.isLoading ? (
          <p className="text-small text-muted-foreground">Đang tải danh sách.</p>
        ) : roster.isError ? (
          <p className="text-small text-muted-foreground">Không tải được danh sách thi.</p>
        ) : students.length === 0 ? (
          <p className="text-small text-muted-foreground">Chưa có sinh viên.</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-base">
            {students.map((student) => (
              <li key={student.mssv} className="flex gap-3">
                <span className="font-mono text-muted-foreground">{student.mssv}</span>
                <span className="text-foreground">{student.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3">Đề & thư mục</h3>
        <ExamFolderPreview materialFilenames={materialFilenames} requiredFiles={requiredFiles} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3">Rubric</h3>
        <p className="text-small text-foreground">
          {rubricId ? rubricName ?? 'Không tìm thấy rubric đã gắn cho phiên này.' : 'Chưa gắn rubric.'}
        </p>
      </section>

      {mutable && checklist ? (
        <>
          <SetupChecklist result={checklist} />
          <Button
            type="button"
            size="lg"
            disabled={!checklist.canOpen || openPending}
            loading={openPending}
            onClick={onOpen}
          >
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            Mở phiên thi
          </Button>
        </>
      ) : (
        <p className="text-small text-muted-foreground">
          {session.status === 'missed'
            ? 'Phiên không diễn ra. Không mở được nữa. Có thể huỷ phiên cạnh tên phiên.'
            : 'Đã khoá — phiên đã mở hoặc đã kết thúc.'}
        </p>
      )}
    </div>
  );
}
