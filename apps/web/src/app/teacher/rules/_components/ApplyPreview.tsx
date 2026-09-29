'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { NeedsBackend } from '@/components/needs-backend';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatVnHundredths, formatVnPoints } from '@/lib/format';
import type { RulePreview } from '@/lib/api/rules';

/** Trạng thái của lần xem trước cho luật đang soạn. */
export type PreviewState =
  | { status: 'invalid' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: RulePreview };

/** Bốn bậc của spec chấm điểm §2.2 — bậc 1 (đổi giá) có ở đây để giảng viên thấy đủ bức tranh, nhưng luật đang soạn chỉ rơi vào 2–4. */
const TIERS: { tier: 1 | 2 | 3 | 4; title: string; note: string }[] = [
  { tier: 1, title: 'Đổi giá một luật đã có', note: 'Tính lại số học, áp ngay cho mọi bài chưa chốt.' },
  { tier: 2, title: 'Luật máy kiểm được, đo trên dữ liệu đã thu', note: 'Áp ngay, kể cả cho bài đã chấm.' },
  { tier: 3, title: 'Luật máy kiểm được, cần chạy lại công cụ', note: 'Chạy lại đúng công cụ đó, một lượt cho cả phiên.' },
  { tier: 4, title: 'Luật bằng lời', note: 'Không áp cho bài đã chấm cho tới khi có đường chấm lại.' },
];

const dash = '—';

/** Điểm hiện tại: chuỗi thập phân theo ĐIỂM ("9.50"). */
function fromPointsString(value: string | null): string {
  return value === null ? dash : formatVnPoints(Number(value));
}

/**
 * Khối "Lưu thì áp vào đâu" (spec §3.2): bốn bậc, tô bậc của luật đang soạn, rồi nội dung riêng cho bậc đó.
 *
 * Chỉ trình bày — việc gọi API (chờ gõ xong, bỏ kết quả cũ) do RuleForm giữ. Hai đơn vị KHÁC nhau trong cùng
 * một bảng bậc 2: `before` là chuỗi thập phân theo điểm, `after` là số nguyên phần trăm điểm.
 */
export function ApplyPreview({ tier, state }: { tier: 2 | 3 | 4; state: PreviewState }) {
  return (
    <section aria-label="Lưu thì áp vào đâu" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Lưu thì áp vào đâu</h2>
        <p className="text-small text-muted-foreground">
          Mọi bài của bạn — phiên đang chấm và các kỳ sau, trừ phiên đã chốt — và không bao giờ sang bài của giảng viên
          khác.
        </p>
      </div>

      <ol aria-label="Bốn bậc áp luật" className="flex flex-col gap-1.5">
        {TIERS.map((t) => {
          const current = t.tier === tier;
          return (
            <li
              key={t.tier}
              aria-current={current ? 'true' : undefined}
              className={`flex flex-col gap-0.5 rounded-md border p-2.5 ${
                current ? 'border-accent bg-accent-subtle' : 'border-transparent'
              }`}
            >
              <span className="flex flex-wrap items-center gap-2 text-small font-semibold">
                <span className="tabular-nums text-muted-foreground">Bậc {t.tier}</span>
                {t.title}
                {current && <Badge variant="accent">Luật đang soạn</Badge>}
              </span>
              <span className="text-caption text-muted-foreground">{t.note}</span>
            </li>
          );
        })}
      </ol>

      <PreviewBody state={state} />
    </section>
  );
}

function PreviewBody({ state }: { state: PreviewState }) {
  if (state.status === 'invalid') {
    return (
      <p className="text-small text-muted-foreground">
        Điền tên, mô tả, tiêu chí (và tham số của mẫu) để xem luật này sẽ áp vào đâu.
      </p>
    );
  }
  if (state.status === 'loading') return <p className="text-small text-muted-foreground">Đang xem trước…</p>;
  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  const { preview } = state;

  if (preview.tier === 2) {
    if (preview.results.length === 0) {
      return <p className="text-small text-muted-foreground">Chưa có bài nào khớp luật này.</p>;
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small font-semibold">{preview.results.length} bài khớp luật này</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bài</TableHead>
                <TableHead className="text-right">Hiện tại</TableHead>
                <TableHead className="text-right">Sau khi lưu</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.results.map((r) => (
                <TableRow key={r.resultId}>
                  <TableCell>
                    <Link
                      href={`/teacher/grading/${r.resultId}?sessionId=${r.sessionId}`}
                      className="font-mono text-caption text-accent-strong hover:underline"
                    >
                      {r.resultId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fromPointsString(r.before)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatVnHundredths(r.after)}</TableCell>
                  <TableCell>{r.capped && <Badge variant="warning">Chạm trần</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (preview.tier === 3) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-small">{preview.reason}</p>
        <p className="text-small text-muted-foreground">
          Ở bản này, lưu luật không tính lại bài nào đã chấm — luật chỉ áp từ phiên chưa chấm.
        </p>
        <div className="relative rounded-lg border border-dashed border-border p-3">
          <span className="text-small font-semibold">Lời gọi công cụ sẽ chạy lại · ước lượng thời gian</span>
          <span className="ml-2 align-middle">
            <NeedsBackend />
          </span>
        </div>
      </div>
    );
  }

  if (preview.sessions.length === 0) {
    return <p className="text-small text-muted-foreground">Bạn chưa có phiên nào.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phiên</TableHead>
            <TableHead>Luật này</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.sessions.map((s) => (
            <TableRow key={s.sessionId}>
              <TableCell>{s.name}</TableCell>
              <TableCell className={s.graded ? 'text-muted-foreground' : 'font-semibold'}>
                {s.graded ? 'Không xét — đã chấm' : 'Sẽ xét'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
