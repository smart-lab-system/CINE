'use client';

import Link from 'next/link';
import { CircleAlert, Cpu, MessageSquare, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Rule } from '@/lib/api/rules';
import {
  MATCH_KIND_LABEL,
  formatDeductionString,
  matchKindOf,
  originLabel,
  type MatchKind,
} from '@/lib/rules-vocab';

/** Mỗi kiểu khớp có biểu tượng + chữ — không truyền tin chỉ bằng màu (spec §2.1 luật 1). */
const KIND_STYLE: Record<MatchKind, { variant: BadgeProps['variant']; icon: typeof Cpu }> = {
  machine: { variant: 'primary', icon: Cpu },
  unmeasured: { variant: 'info', icon: CircleAlert },
  words: { variant: 'default', icon: MessageSquare },
};

export function RuleTable({ rules, onEditPrice }: { rules: Rule[]; onEditPrice: (rule: Rule) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lỗi</TableHead>
            <TableHead>Tiêu chí</TableHead>
            <TableHead>Cách khớp</TableHead>
            <TableHead className="text-right">Mức trừ</TableHead>
            <TableHead>Đang áp vào</TableHead>
            <TableHead>Cảnh báo</TableHead>
            <TableHead>
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const kind = matchKindOf(rule);
            const { variant, icon: Icon } = KIND_STYLE[kind];
            const unpriced = rule.deduction === null;
            return (
              <TableRow key={rule.id}>
                <TableCell>
                  <span className="font-semibold">{rule.revision.name}</span>
                  <span className="block font-mono text-caption text-muted-foreground">
                    {rule.ruleKey} · {originLabel(rule.origin)}
                  </span>
                </TableCell>
                <TableCell>{rule.revision.criterionKey}</TableCell>
                <TableCell>
                  <Badge variant={variant} className="gap-1.5">
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {MATCH_KIND_LABEL[kind]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {unpriced ? (
                    <Badge variant="warning" className="gap-1.5">
                      <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                      Chưa có giá
                    </Badge>
                  ) : (
                    <span className="font-bold">{formatDeductionString(rule.deduction)}</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {rule.appliedTo.results} bài · {rule.appliedTo.sessions} phiên
                </TableCell>
                <TableCell>
                  {rule.mismatchedIn > 0 && (
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="destructive">{rule.mismatchedIn} bài lệch tiêu chí</Badge>
                      <Link
                        href={`/teacher/rules/${rule.id}`}
                        className="text-caption font-medium text-accent-strong hover:underline"
                      >
                        Sửa luật này
                      </Link>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/teacher/rules/${rule.id}`}
                      className="text-small font-medium text-accent-strong hover:underline"
                    >
                      Sửa luật
                    </Link>
                    <Button size="sm" variant={unpriced ? 'default' : 'outline'} onClick={() => onEditPrice(rule)}>
                      {unpriced ? 'Đặt giá' : 'Sửa giá'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
