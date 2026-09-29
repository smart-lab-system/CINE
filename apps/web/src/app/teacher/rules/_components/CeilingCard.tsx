'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsBackend } from '@/components/needs-backend';
import { useRubrics } from '@/hooks/useGrading';
import { useRevokeWaiver, useRules, useSetWaiver, useWaivers } from '@/hooks/useRules';
import { formatVnPoints } from '@/lib/format';
import { defaultRubricName } from '@/lib/rubric-form';
import { describeRecompute } from '@/lib/rules-vocab';
import type { CriterionWaiver } from '@/lib/api/rules';
import { RubricDialog } from './RubricDialog';

type Confirming = { key: string; waiver: CriterionWaiver | undefined };

/**
 * "Trần điểm theo tiêu chí" (spec §3.1) — thay việc của trang Rubric cũ, ngay cạnh các luật dùng nó.
 *
 * Mỗi tiêu chí hiện trần; tiêu chí nào chưa luật ĐANG DÙNG nào trỏ vào thì có ô "Tiêu chí này không có luật
 * trừ" (đánh dấu = bài luôn trọn điểm tiêu chí đó). Đánh dấu và gỡ đều đổi điểm phiên chưa chốt, nên luôn hỏi
 * xác nhận nói hệ quả TRƯỚC, rồi đọc kết quả tính lại bằng lời sau.
 *
 * Đánh dấu gắn theo id PHIÊN BẢN rubric (server: criterion_waiver.rubric_id) — lưu bản mới thì bản mới bắt
 * đầu chưa có đánh dấu nào; card nói điều đó sau khi lưu chứ không để giảng viên tự phát hiện.
 */
export function CeilingCard() {
  const rubrics = useRubrics();
  const rules = useRules();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'create' | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const name = selected ?? defaultRubricName(rubrics.data);
  const versions = useMemo(() => (rubrics.data ?? []).filter((r) => r.name === name), [rubrics.data, name]);
  const active = versions.find((r) => r.isActive) ?? versions[0];
  const names = useMemo(() => [...new Set((rubrics.data ?? []).map((r) => r.name))], [rubrics.data]);

  const waivers = useWaivers(active?.id);
  const setWaiver = useSetWaiver(active?.id);
  const revokeWaiver = useRevokeWaiver(active?.id);

  const ruleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rules.data ?? []) counts[r.revision.criterionKey] = (counts[r.revision.criterionKey] ?? 0) + 1;
    return counts;
  }, [rules.data]);

  function confirm() {
    if (!confirming) return;
    const done = (text: string) => {
      setNotice(text);
      setConfirming(null);
    };
    if (confirming.waiver) {
      revokeWaiver.mutate(confirming.waiver.id, { onSuccess: (data) => done(describeRecompute(data.recompute)) });
    } else {
      setWaiver.mutate(confirming.key, {
        onSuccess: (data) =>
          done(
            data.recompute === null
              ? 'Đánh dấu này đã có từ trước, không tính lại bài nào.'
              : describeRecompute(data.recompute),
          ),
      });
    }
  }

  const open = (which: 'edit' | 'create') => {
    setNotice(null);
    setDialog(which);
  };

  const body = () => {
    if (rubrics.isLoading) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">Đang tải…</p>
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    if (rubrics.isError) {
      return (
        <Alert variant="destructive">
          <AlertDescription>Không tải được rubric — {rubrics.error?.message}.</AlertDescription>
        </Alert>
      );
    }
    if (!active) {
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-small text-muted-foreground">
            Bạn chưa có rubric nào. Trần điểm của từng tiêu chí nằm trong rubric — luật chỉ trừ tới trần đó.
          </p>
          <Button type="button" onClick={() => open('create')}>
            Tạo rubric
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {names.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="ceiling-rubric" className="text-caption font-semibold text-muted-foreground">
              Rubric
            </label>
            <select
              id="ceiling-rubric"
              value={name ?? ''}
              onChange={(e) => {
                setSelected(e.target.value);
                setNotice(null);
              }}
              className="h-10 rounded-md border border-input bg-surface px-3 text-body"
            >
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-caption text-muted-foreground">
          {active.name} · phiên bản {active.version}
        </p>

        <ul className="flex flex-col divide-y divide-border">
          {active.criteria.map((c) => {
            const hasRules = (ruleCounts[c.key] ?? 0) > 0;
            const waiver = waivers.data?.find((w) => w.criterionKey === c.key);
            return (
              <li key={c.key} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-mono text-small font-semibold">{c.key}</span>
                    <span className="text-caption text-muted-foreground">{c.description}</span>
                  </span>
                  <span className="flex items-baseline gap-1 text-small">
                    <span className="text-caption text-muted-foreground">trần</span>
                    <span className="font-semibold tabular-nums">{formatVnPoints(c.maxPoints)}</span>
                  </span>
                </div>
                {(!hasRules || waiver) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {!hasRules && <span className="text-caption font-semibold text-warning-strong">chưa có luật nào</span>}
                    <label className="flex items-center gap-2 text-small">
                      <input
                        type="checkbox"
                        checked={Boolean(waiver)}
                        aria-label={`Tiêu chí này không có luật trừ — ${c.key}`}
                        onChange={() => {
                          setNotice(null);
                          setConfirming({ key: c.key, waiver });
                        }}
                      />
                      Tiêu chí này không có luật trừ
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-baseline justify-between border-t border-border pt-2.5 text-small">
          <span className="font-semibold">Điểm tối đa</span>
          <span className="font-semibold tabular-nums">{formatVnPoints(active.totalPoints)}</span>
        </div>
      </div>
    );
  };

  const mutation = confirming?.waiver ? revokeWaiver : setWaiver;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-h3">Trần điểm theo tiêu chí</CardTitle>
        {active && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => open('edit')}>
              Sửa trần
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => open('create')}>
              Rubric mới
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {notice && (
          <Alert variant="success" role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {body()}
      </CardContent>

      <RubricDialog
        open={dialog !== null}
        onOpenChange={(next) => !next && setDialog(null)}
        rubric={dialog === 'edit' ? active : undefined}
        existingNames={names}
        ruleCounts={ruleCounts}
        onSaved={(saved) => {
          const hadMarks = (waivers.data?.length ?? 0) > 0;
          setSelected(saved.name);
          setNotice(
            `Đã lưu "${saved.name}" — phiên bản ${saved.version}, ${formatVnPoints(saved.totalPoints)} điểm.` +
              (hadMarks
                ? ' Các đánh dấu "không có luật trừ" gắn với từng phiên bản — nếu cần, đánh dấu lại cho bản mới.'
                : ''),
          );
        }}
      />

      <Dialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming?.waiver ? 'Bỏ đánh dấu "không có luật trừ"?' : 'Đánh dấu tiêu chí không có luật trừ?'}
            </DialogTitle>
            <DialogDescription>
              {confirming?.waiver
                ? `Bỏ đánh dấu: tiêu chí ${confirming.key} lại đòi có luật trừ. Bài nào chưa có luật cho tiêu chí này sẽ không tự quyết được ("Cần bạn xem"); các phiên chưa chốt được tính lại.`
                : `Từ giờ tiêu chí ${confirming?.key} luôn trọn điểm cho mọi bài chấm theo rubric này; các phiên chưa chốt được tính lại.`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-small text-muted-foreground">
            Xem trước tác động của việc này: <NeedsBackend className="ml-1" />
          </p>
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
              Huỷ
            </Button>
            <Button type="button" loading={mutation.isPending} onClick={confirm}>
              {confirming?.waiver ? 'Bỏ đánh dấu' : 'Đánh dấu không có luật trừ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
