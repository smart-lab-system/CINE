import { formatDateTime } from '@/components/exams/datetime-local';
import { EXAM_STATUS_LABELS } from '@/components/exams/exam-status';
import type { ExamEventStatus, StatusHistoryRow } from '@/components/exams/exam-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ExamHistoryPanel({
  title = 'Lịch sử trạng thái',
  items,
}: {
  title?: string;
  items: StatusHistoryRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời điểm</TableHead>
              <TableHead>Từ</TableHead>
              <TableHead>Sang</TableHead>
              <TableHead>Lý do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-sm text-muted-foreground"
                >
                  Chưa có lịch sử.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.commandId + row.createdAt}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    {row.fromStatus
                      ? EXAM_STATUS_LABELS[row.fromStatus as ExamEventStatus] ??
                        row.fromStatus
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {EXAM_STATUS_LABELS[row.toStatus] ?? row.toStatus}
                  </TableCell>
                  <TableCell>{row.reason}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
