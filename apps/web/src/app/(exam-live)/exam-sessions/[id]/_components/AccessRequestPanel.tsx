'use client';

import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveAccessRequest, type PendingAccessRequest } from '@/lib/access-request';
import type { TeachingClass } from '@/lib/api/teaching';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface AccessRequestPanelProps {
  requests: PendingAccessRequest[];
  /** Already filtered to this session's course — a class from a different
   *  course would fail server-side anyway (`findClassForCourse`), so
   *  there is no point offering it. */
  classes: TeachingClass[];
  onResolved: (requestId: string) => void;
}

/**
 * Sinh viên ngoài danh sách lớp xin vào phiên thi — the counterweight to
 * `agent:join`'s enrollment check (Security rule 1). The backend has
 * always broadcast `lobby:access_request` the moment this happens; this
 * panel (and the toast that fires alongside it, see the lobby page) is
 * what was missing — before this, the event reached the browser and was
 * dropped on the floor, so the teacher was never told a student was
 * waiting at all. Reported directly against the live app.
 */
export function AccessRequestPanel({ requests, classes, onResolved }: AccessRequestPanelProps) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-warning/40">
      <CardHeader className="flex-row items-center gap-3 border-b border-border bg-warning-subtle/60">
        <UserPlus className="h-5 w-5 text-warning-strong" aria-hidden="true" />
        <CardTitle className="text-h3">
          Yêu cầu vào thi{' '}
          <Badge variant="warning" className="ml-1 align-middle">
            {requests.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {requests.map((request) => (
          <RequestRow
            key={request.requestId}
            request={request}
            classes={classes}
            onResolved={() => onResolved(request.requestId)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function RequestRow({
  request,
  classes,
  onResolved,
}: {
  request: PendingAccessRequest;
  classes: TeachingClass[];
  onResolved: () => void;
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  // '' rather than undefined, and always passed to Select's `value` below
  // — React warns loudly if a controlled input ever starts undefined and
  // later gets a real value ("changing from uncontrolled to controlled").
  const [homeClassId, setHomeClassId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(approve: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const ack = await resolveAccessRequest({
        requestId: request.requestId,
        approve,
        homeClassId: approve ? homeClassId : undefined,
      });
      if (!ack.ok) {
        setError(ack.message);
        return;
      }
      toast.success(
        approve
          ? `Đã duyệt ${request.fullName} vào phiên thi.`
          : `Đã từ chối yêu cầu của ${request.fullName}.`,
      );
      setApproveOpen(false);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được yêu cầu duyệt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-foreground">
          {request.fullName}{' '}
          <span className="font-mono text-small text-muted-foreground">{request.studentId}</span>
        </p>
        <p className="text-small text-muted-foreground">{request.reason}</p>
        <p className="text-caption text-muted-foreground">
          Xin vào lúc {formatTime(request.requestedAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => void submit(false)}
        >
          Từ chối
        </Button>
        <Button type="button" size="sm" disabled={submitting} onClick={() => setApproveOpen(true)}>
          Duyệt
        </Button>
      </div>

      <Dialog open={approveOpen} onOpenChange={(next) => !submitting && setApproveOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duyệt {request.fullName} vào thi?</DialogTitle>
            <DialogDescription>
              Chọn lớp để thêm sinh viên này vào danh sách — bài nộp sau này sẽ được tính vào
              lớp bạn chọn ở đây.
            </DialogDescription>
          </DialogHeader>

          <Select value={homeClassId} onValueChange={setHomeClassId}>
            <SelectTrigger id={`home-class-${request.requestId}`}>
              <SelectValue placeholder="Chọn lớp" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((klass) => (
                <SelectItem key={klass.id} value={klass.id}>
                  {klass.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={submitting}>
              Huỷ
            </Button>
            <Button disabled={submitting || !homeClassId} onClick={() => void submit(true)}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Duyệt vào thi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
