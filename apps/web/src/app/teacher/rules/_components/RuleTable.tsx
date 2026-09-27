'use client';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Rule } from '@/lib/api/rules';

export function RuleTable({ rules, onEditPrice }: { rules: Rule[]; onEditPrice: (rule: Rule) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Luật</TableHead>
            <TableHead>Tiêu chí</TableHead>
            <TableHead>Nguồn</TableHead>
            <TableHead className="text-right">Giá</TableHead>
            <TableHead className="text-right">Đã áp</TableHead>
            <TableHead>Cảnh báo</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <span className="font-medium">{rule.ruleKey}</span>
                <span className="block text-caption text-muted-foreground">{rule.revision.name}</span>
              </TableCell>
              <TableCell>{rule.revision.criterionKey}</TableCell>
              <TableCell>
                <Badge variant={rule.checkedBy === 'machine' ? 'accent' : 'info'}>
                  {rule.checkedBy === 'machine' ? 'Máy kiểm' : 'Model'}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {rule.deduction === null ? <Badge variant="warning">chưa có giá</Badge> : rule.deduction}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {rule.appliedTo.results} bài / {rule.appliedTo.sessions} phiên
              </TableCell>
              <TableCell>
                {rule.mismatchedIn > 0 && (
                  <Badge variant="destructive">{rule.mismatchedIn} bài lệch tiêu chí</Badge>
                )}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-small font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onEditPrice(rule)}
                >
                  Sửa giá
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
