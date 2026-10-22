'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ClipboardList, Copy, GraduationCap } from 'lucide-react';
import { EXAM_TYPES } from '@/app/teacher/exam-sessions/new/schema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { ExamSessionResponse } from '@/lib/api/exam-session';
import {
  EXAM_SESSION_STATUS_BADGE_CLASS,
  EXAM_TYPE_LABELS,
  getDisplaySessionStatus,
} from '@/lib/exam-session-display';
import { useStatusClock } from '@/lib/use-status-clock';
import { useSetupDraft } from './SetupDraftProvider';
import type { SetupInfoDraft } from './setup-draft';

export function SessionInfoStep({
  session,
  className,
  roomOptions,
  roomsLoading,
  mutable,
  serverInfo,
  onCopyCode,
}: {
  session: ExamSessionResponse;
  className: string | null;
  roomOptions: { value: string; label: string; keywords?: string }[];
  roomsLoading: boolean;
  mutable: boolean;
  serverInfo: SetupInfoDraft;
  onCopyCode: () => void;
}) {
  const setup = useSetupDraft();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shown = setup.draft?.info ?? serverInfo;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    return setupRef.current.registerSnapshot(() => ({ info: shownRef.current }));
  }, []);

  function update(partial: Partial<SetupInfoDraft>) {
    setup.patchDraft({ info: { ...shownRef.current, ...partial } });
  }

  const statusNow = useStatusClock([session]);
  const display = getDisplaySessionStatus(
    session.status,
    session.startTime,
    session.endTime,
    statusNow,
  );
  const reason = setup.errorStep === 'info' ? setup.blockReason : null;
  const apiMessage = setup.apiError?.step === 'info' ? setup.apiError.message : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
          Thông tin chung
        </h2>
        <Badge variant={display.variant} className={EXAM_SESSION_STATUS_BADGE_CLASS}>
          {display.label}
        </Badge>
      </div>
      {session.status === 'not_ready' ? (
        <Alert variant="warning">
          <AlertDescription>
            Chưa đủ điều kiện để tự mở. Hãy bổ sung thiết lập trước giờ bắt đầu. Đến giờ mà vẫn
            thiếu, phiên chuyển sang Không diễn ra và không dùng được nữa.
          </AlertDescription>
        </Alert>
      ) : null}
      {session.status === 'missed' ? (
        <Alert variant="destructive">
          <AlertDescription>
            Phiên không diễn ra. Không mở được và không dùng cho ca thi này. Có thể huỷ phiên.
          </AlertDescription>
        </Alert>
      ) : null}
      {mutable ? (
        <p className="text-base text-muted-foreground">
          Sửa loại thi, thời gian và phòng thi trước khi mở phiên.
        </p>
      ) : null}

      <dl className="grid gap-4 text-base sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Mã phiên</dt>
          <dd className="mt-1">
            <button
              type="button"
              onClick={onCopyCode}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 font-mono text-lg font-semibold tracking-[0.12em] text-primary"
              aria-label={`Sao chép mã ${session.code}`}
            >
              {session.code}
              <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Môn học</dt>
          <dd className="mt-1 text-lg font-medium text-foreground">{session.courseName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lớp</dt>
          <dd className="mt-1 text-lg font-medium text-foreground">{className ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Học kỳ</dt>
          <dd className="mt-1 text-lg font-medium text-foreground">{session.semesterName}</dd>
        </div>
      </dl>

      <FormField id="setup-exam-type" label="Loại thi">
        <select
          id="setup-exam-type"
          aria-label="Loại thi"
          disabled={!mutable}
          value={shown.examType}
          onChange={(event) => update({ examType: event.target.value })}
          className="h-12 rounded-md border border-input bg-surface px-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {EXAM_TYPES.map((type) => (
            <option key={type} value={type}>
              {EXAM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold">Thời gian</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="setup-start" label="Bắt đầu">
            <Input
              id="setup-start"
              type="datetime-local"
              value={shown.startLocal}
              disabled={!mutable}
              onChange={(event) => update({ startLocal: event.target.value })}
            />
          </FormField>
          <FormField id="setup-end" label="Kết thúc">
            <Input
              id="setup-end"
              type="datetime-local"
              value={shown.endLocal}
              disabled={!mutable}
              onChange={(event) => update({ endLocal: event.target.value })}
            />
          </FormField>
        </div>
        {reason ? (
          <Alert variant="destructive">
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <FormField id="setup-room" label="Phòng thi">
        <SearchableSelect
          value={shown.roomId}
          onValueChange={(roomId) => update({ roomId })}
          options={roomOptions}
          placeholder={roomsLoading ? 'Đang tải…' : 'Chọn phòng'}
          disabled={!mutable || roomsLoading}
        />
      </FormField>

      {apiMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{apiMessage}</AlertDescription>
        </Alert>
      ) : null}

      {session.status === 'collecting' || session.status === 'completed' ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline">
            <Link href="/teacher/submissions">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Quản lý bài thu
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/teacher/grading?sessionId=${session.id}`}>
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              Chuẩn bị chấm
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
