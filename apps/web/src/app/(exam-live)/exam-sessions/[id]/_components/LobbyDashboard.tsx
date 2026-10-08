'use client';

import {
  ClipboardList,
  FileWarning,
  UserCheck,
  UserMinus,
  Users,
  FileCheck,
  FileX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatAttendanceTime } from './student-marks';

export interface LobbyDashboardProps {
  rosterSize: number;
  presentCount: number;
  absentCount: number;
  makeupCount: number;
  fullySubmitted: number;
  notSubmitted: number;
  invalidCount: number;
  confirmedAt: string | null;
  confirmedCount: number | null;
  classId: string | null;
}

interface Metric {
  key: string;
  label: string;
  value: number | string;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'destructive';
  hide?: boolean;
}

/**
 * Dashboard tổng quan phòng chờ — chỉ số + nhãn, không danh sách (spec §5).
 */
export function LobbyDashboard({
  rosterSize,
  presentCount,
  absentCount,
  makeupCount,
  fullySubmitted,
  notSubmitted,
  invalidCount,
  confirmedAt,
  confirmedCount,
  classId,
}: LobbyDashboardProps) {
  const metrics: Metric[] = [
    {
      key: 'roster',
      label: 'Sĩ số lớp',
      value: classId === null ? '—' : rosterSize,
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      key: 'present',
      label: 'Có mặt',
      value: presentCount,
      icon: <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'success',
    },
    {
      key: 'absent',
      label: 'Vắng mặt',
      value: absentCount,
      icon: <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'warning',
    },
    {
      key: 'makeup',
      label: 'Thi bổ sung',
      value: makeupCount,
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'info',
      hide: makeupCount === 0,
    },
    {
      key: 'submitted',
      label: 'Đã nộp',
      value: fullySubmitted,
      icon: <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'success',
    },
    {
      key: 'not_submitted',
      label: 'Chưa nộp',
      value: notSubmitted,
      icon: <FileX className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'warning',
    },
    {
      key: 'invalid',
      label: 'File lỗi',
      value: invalidCount,
      icon: <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />,
      variant: 'destructive',
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div
          aria-live="polite"
          className="flex flex-wrap gap-2"
        >
          {metrics
            .filter((m) => !m.hide)
            .map((metric) => (
              <Badge
                key={metric.key}
                variant={metric.variant ?? 'default'}
                className="gap-1.5 px-3 py-1.5"
                aria-label={`${metric.label}: ${metric.value}`}
              >
                {metric.icon}
                <span>{metric.label}</span>
                <strong className="tabular-nums">{metric.value}</strong>
              </Badge>
            ))}
        </div>

        <p className="flex items-center gap-2 text-small text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {confirmedAt ? (
            <span>
              Xác nhận sĩ số:{' '}
              <strong className="tabular-nums text-foreground">{confirmedCount}</strong> lúc{' '}
              {formatAttendanceTime(confirmedAt)}
            </span>
          ) : (
            <span>Xác nhận sĩ số: Chưa xác nhận</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
