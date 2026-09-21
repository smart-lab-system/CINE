'use client';

import * as React from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, CircleCheck, ClipboardCheck, Eye, RotateCcw } from 'lucide-react';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import {
  PHASE_LABELS, getAttentionReasons, getSessionPhase,
  type AttentionReason, type SessionGroup,
} from '@/lib/submission-attention';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// 'neutral' cố ý dùng màu chữ phụ, không phải một sắc cảnh báo nhạt hơn:
// dòng 'thi bù ở phiên khác' trả lời một câu hỏi chứ không giao việc, và tô
// nó cùng họ màu với ba mức kia là dạy giảng viên bỏ qua cả ba.
type ReasonTone = AttentionReason['tone'];
const TONE_DOT: Record<ReasonTone, string> = {
  danger: 'bg-danger', warning: 'bg-warning', caution: 'bg-warning/60',
  neutral: 'bg-muted-foreground/50',
};
const TONE_TEXT: Record<ReasonTone, string> = {
  danger: 'text-danger-strong', warning: 'text-warning-strong', caution: 'text-warning-strong/80',
  neutral: 'text-muted-foreground',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Icon một mình không phải nhãn đọc được — mỗi nút có aria-label VÀ tooltip. */
function IconAction({
  label, icon: Icon, onClick, href,
}: {
  label: string;
  icon: typeof Eye;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border
                 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label}>{body}</Link>
        ) : (
          <button type="button" aria-label={label} onClick={onClick}>{body}</button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Cột Tình trạng không bao giờ để trống: ô trống trông giống "chưa tính xong"
 * hơn là tin tốt. Phiên chưa kết thúc hiện tên pha thay vì kết luận — spec §4.2.
 */
function StatusCell({ item, now }: { item: SessionOverviewItem; now: number }) {
  if (item.attentionClosedAt !== null) {
    return <span className="text-caption text-muted-foreground">Đã khép</span>;
  }
  const phase = getSessionPhase(item, now);
  if (phase !== 'ended') {
    return <span className="text-muted-foreground">{PHASE_LABELS[phase]}</span>;
  }
  const reasons = getAttentionReasons(item, now);
  if (reasons.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success-strong">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        ✓ Đủ
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {reasons.map((reason, index) => (
        <span
          key={reason.kind}
          className={cn('inline-flex items-center gap-1.5 font-medium', TONE_TEXT[reason.tone])}
        >
          {index === 0 && (
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[reason.tone])}
              aria-hidden="true"
            />
          )}
          {reason.label}
        </span>
      ))}
    </span>
  );
}

interface SessionTableProps {
  groups: SessionGroup[];
  now: number;
  onArchive: (id: string, on: boolean) => void;
  onCloseAttention: (id: string, on: boolean) => void;
}

/**
 * MỘT <table> cho cả trang — tiêu đề nhóm là <tr> gộp cột BÊN TRONG bảng đó.
 * Nếu tách mỗi nhóm thành một <table> riêng thì cột lệch nhau giữa các nhóm và
 * toàn bộ lợi thế quét mắt biến mất, tức là mất luôn lý do chọn bảng. Spec §5.2.
 */
export function SessionTable({ groups, now, onArchive, onCloseAttention }: SessionTableProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[36%]">Phiên thi</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Phòng</TableHead>
              <TableHead>Tình trạng</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              // Fragment PHẢI mang key: hai <TableRow> anh em trong một vòng map.
              <React.Fragment key={group.key}>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="bg-surface-2/60 font-semibold text-foreground">
                    {group.className ?? 'Không gắn lớp'}
                    <span className="ml-2 font-normal text-caption text-muted-foreground">
                      {group.sessions.length} phiên
                      {group.sessions[0] ? ` · ${group.sessions[0].expectedCount} sinh viên` : ''}
                      {group.attentionCount > 0 ? ` · ${group.attentionCount} cần chú ý` : ''}
                    </span>
                  </TableCell>
                </TableRow>
                {group.sessions.map((item) => (
                  <TableRow
                    key={item.id}
                    className={cn(item.attentionClosedAt !== null && 'opacity-60')}
                  >
                    <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {EXAM_TYPE_LABELS[item.examType] ?? item.examType}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDateTime(item.startTime)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {item.roomName}
                    </TableCell>
                    <TableCell><StatusCell item={item} now={now} /></TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <IconAction
                          label="Xem chi tiết phiên"
                          icon={Eye}
                          href={`/teacher/submissions/${item.id}`}
                        />
                        <IconAction
                          label="Chấm điểm"
                          icon={ClipboardCheck}
                          href={`/teacher/grading?sessionId=${item.id}`}
                        />
                        <IconAction
                          label={item.attentionClosedAt !== null ? 'Mở lại phiên' : 'Khép phiên'}
                          icon={item.attentionClosedAt !== null ? RotateCcw : CircleCheck}
                          onClick={() => onCloseAttention(item.id, item.attentionClosedAt === null)}
                        />
                        <IconAction
                          label={item.archivedAt !== null ? 'Bỏ lưu trữ' : 'Lưu trữ phiên'}
                          icon={item.archivedAt !== null ? ArchiveRestore : Archive}
                          onClick={() => onArchive(item.id, item.archivedAt === null)}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
