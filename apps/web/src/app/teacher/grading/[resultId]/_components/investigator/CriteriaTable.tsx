import { formatVnPoints } from '@/lib/format';

export function CriteriaTable({
  perCriterion,
}: {
  perCriterion: { key: string; maxHundredths: number; deductedHundredths: number; capped: boolean }[];
}) {
  const totalMax = perCriterion.reduce((sum, c) => sum + c.maxHundredths, 0);
  const totalDeducted = perCriterion.reduce((sum, c) => sum + c.deductedHundredths, 0);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-label">Theo tiêu chí</h2>
      <table className="w-full text-small">
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th className="text-left font-semibold">Tiêu chí</th>
            <th className="text-right font-semibold">Trần</th>
            <th className="text-right font-semibold">Bị trừ</th>
            <th className="text-right font-semibold">Còn</th>
          </tr>
        </thead>
        <tbody>
          {perCriterion.map((c) => (
            <tr key={c.key} className="border-t border-border/70">
              <td>
                {c.key}
                {c.capped && <span className="ml-1 text-caption font-semibold text-muted-foreground">· chạm trần</span>}
              </td>
              <td className="text-right tabular-nums">{formatVnPoints(c.maxHundredths / 100)}</td>
              <td className="text-right tabular-nums">−{formatVnPoints(c.deductedHundredths / 100)}</td>
              <td className="text-right font-semibold tabular-nums">
                {formatVnPoints((c.maxHundredths - c.deductedHundredths) / 100)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td>Tổng</td>
            <td className="text-right tabular-nums">{formatVnPoints(totalMax / 100)}</td>
            <td className="text-right tabular-nums">−{formatVnPoints(totalDeducted / 100)}</td>
            <td className="text-right tabular-nums">{formatVnPoints((totalMax - totalDeducted) / 100)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
