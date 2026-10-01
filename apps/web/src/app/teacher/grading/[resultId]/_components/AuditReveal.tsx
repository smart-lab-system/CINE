'use client';

import { Bot, Check, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
import { formatVnPoints } from '@/lib/format';

const VERDICT_LABEL = {
  both: 'Cả hai đều thấy',
  teacher_only: 'Chỉ bạn thấy',
  system_only: 'Chỉ hệ thống thấy',
} as const;

const AGREEMENT_LABEL = { full: 'Trùng khớp hoàn toàn', partial: 'Trùng một phần', none: 'Không trùng' } as const;
const AGREEMENT_VARIANT = { full: 'success', partial: 'warning', none: 'warning' } as const;
/** Biểu tượng đi KÈM chữ — màu một mình không nói gì với người mù màu. */
const VERDICT_ICON = { both: Check, teacher_only: User, system_only: Bot } as const;

/**
 * Lúc che mù kết thúc (parent spec §8.1 luật 3): điểm hệ thống, lỗi nó giữ, và so sánh với những gì giảng viên vừa
 * chọn — THEO TỪNG LUẬT, bằng chữ. Nhận xét đã khoá; điểm không đổi. Bất đồng thì giảng viên dùng đường có sẵn trong
 * hồ sơ (ngoại lệ từng lỗi, hoặc chấm tay) — màn này không sửa điểm.
 */
export function AuditReveal({ reveal, onOpenDossier }: { reveal: AuditRevealData; onOpenDossier: () => void }) {
  const unpriced = new Set(reveal.systemErrors.filter((e) => e.counted === 'unpriced').map((e) => e.ruleId));
  const { summary } = reveal;

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="success">
        <AlertDescription>Đã ghi nhận xét của bạn — khoá, không sửa được nữa. Đây là điều hệ thống đã giữ.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-h3">Điểm hệ thống</CardTitle>
          <Badge variant={AGREEMENT_VARIANT[summary.agreement]}>{AGREEMENT_LABEL[summary.agreement]}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-h1 tabular-nums">{formatVnPoints(reveal.currentScore)}</p>
          <p className="text-small text-muted-foreground">
            Điểm này không đổi vì nhận xét của bạn. Nếu bạn không đồng ý với hệ thống, dùng Ngoại lệ hoặc Chấm tay trong
            hồ sơ.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">So sánh từng luật</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {reveal.perRule.length === 0 ? (
            <p className="text-small text-muted-foreground">Cả bạn và hệ thống đều không thấy lỗi nào trong bảng lỗi.</p>
          ) : (
            <ul aria-label="So sánh từng luật" className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {reveal.perRule.map((r) => (
                <li key={r.ruleId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-small">
                  <span className="font-medium">{r.ruleName}</span>
                  <span className="flex items-center gap-2">
                    {r.verdict === 'system_only' && unpriced.has(r.ruleId) && (
                      <span className="text-caption text-muted-foreground">chưa có giá — chưa trừ điểm</span>
                    )}
                    <VerdictBadge verdict={r.verdict} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {reveal.extraErrors.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-small font-semibold">Lỗi bạn ghi ngoài bảng lỗi</h3>
              <ul className="list-disc pl-5 text-small">
                {reveal.extraErrors.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <ul aria-label="Tổng kết" className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <li>Cả hai thấy: {summary.both}</li>
            <li>Chỉ bạn thấy: {summary.teacherOnly}</li>
            <li>Chỉ hệ thống thấy: {summary.systemOnly}</li>
            <li>Không ai thấy: {summary.neither}</li>
            <li>Lỗi ngoài bảng lỗi: {summary.extra}</li>
          </ul>
        </CardContent>
      </Card>

      <Button type="button" className="self-start" onClick={onOpenDossier}>
        Mở hồ sơ
      </Button>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: keyof typeof VERDICT_LABEL }) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <Badge variant={verdict === 'both' ? 'accent' : 'warning'}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}
