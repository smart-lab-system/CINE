'use client';

import Link from 'next/link';
import { Ban, Pencil, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { cancelAvailability, editAvailability } from '@/lib/exam-session-actions';

/**
 * Nút không đủ điều kiện (spec §4.1: "không để nút bấm rồi mới báo 409", T-SES-11). KHÔNG dùng `disabled`: nút `disabled` rời khỏi thứ tự focus nên
 * bàn phím không bao giờ tới được để đọc lý do, và nhiều trình đọc màn hình bỏ qua nó. `aria-disabled` + `aria-describedby` giữ nút trong thứ tự
 * focus và đọc lý do; tooltip là phần bổ trợ cho người dùng chuột. Mô tả ẩn LUÔN có trong DOM (không đợi tooltip mở).
 */
function BlockedAction({
  id,
  label,
  ariaLabel,
  icon: Icon,
  reason,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  reason: string;
}) {
  const reasonId = `${id}-reason`;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled="true"
            aria-label={ariaLabel}
            aria-describedby={reasonId}
            onClick={(event) => event.preventDefault()}
            className="cursor-not-allowed opacity-55"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  );
}

/**
 * "Sửa" và "Huỷ phiên" của MỘT hàng. Điều kiện nằm ở `lib/exam-session-actions` (hàm thuần, có test): Sửa chỉ khi `active` và chưa tới giờ bắt đầu;
 * Huỷ khi `active` — có ai vào phòng chưa là việc của server, 409 hiện trong hộp thoại. `aria-label` mang tên phiên vì một bảng có nhiều hàng.
 */
export function SessionRowActions({
  session,
  now,
  onCancel,
}: {
  session: ExamSessionListItem;
  now: number;
  onCancel: (session: ExamSessionListItem) => void;
}) {
  const edit = editAvailability(session, now);
  const cancel = cancelAvailability(session);

  return (
    <TooltipProvider delayDuration={200}>
      {edit.allowed ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/teacher/exam-sessions/${session.id}/edit`} aria-label={`Sửa phiên ${session.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Sửa
          </Link>
        </Button>
      ) : (
        <BlockedAction id={`edit-${session.id}`} label="Sửa" ariaLabel={`Sửa phiên ${session.name}`} icon={Pencil} reason={edit.reason} />
      )}
      {cancel.allowed ? (
        <Button type="button" variant="outline" size="sm" aria-label={`Huỷ phiên ${session.name}`} onClick={() => onCancel(session)}>
          <Ban className="h-4 w-4" aria-hidden="true" />
          Huỷ phiên
        </Button>
      ) : (
        <BlockedAction id={`cancel-${session.id}`} label="Huỷ phiên" ariaLabel={`Huỷ phiên ${session.name}`} icon={Ban} reason={cancel.reason} />
      )}
    </TooltipProvider>
  );
}
