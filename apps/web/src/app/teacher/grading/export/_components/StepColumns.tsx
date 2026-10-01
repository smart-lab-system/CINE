'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import type { InspectResponse } from '@/lib/api/grade-export';
import { GRID_ROWS, columnsReady, sampledOverwriteCount, type ColumnChoice } from '@/lib/grade-export-view';

type Role = 'mssv' | 'score' | 'reason';
const ROLE_TAG: Record<Role, string> = { mssv: 'MSSV', score: 'Điểm', reason: 'Lý do' };
/** Màu VÀ chữ: màu một mình không nói gì với người mù màu (spec §3.6). */
const ROLE_CELL: Record<Role, string> = { mssv: 'bg-info-subtle', score: 'bg-accent-subtle', reason: 'bg-warning-subtle' };
const SELECT_CLASS = 'h-10 w-full rounded-md border border-input bg-surface px-3 text-body disabled:opacity-60';

/**
 * Bước 2 (spec §3.6): chọn trang tính, dòng bắt đầu dữ liệu và ba cột. KHÔNG cái nào được chọn sẵn — kể cả khi tiêu
 * đề ghi "MSSV" (Security rule 9). Cột đã chọn được tô màu VÀ gắn nhãn chữ ở tiêu đề cột. Component chỉ hiện; trạng
 * thái do `ExportWizard` giữ.
 */
export function StepColumns({
  inspect,
  choice,
  busy,
  onChange,
  onSelectSheet,
  onLoadRows,
  onNext,
}: {
  inspect: InspectResponse;
  choice: ColumnChoice;
  busy: boolean;
  onChange: (patch: Partial<ColumnChoice>) => void;
  onSelectSheet: (name: string) => void;
  onLoadRows: (fromRow: number) => void;
  onNext: () => void;
}) {
  const grid = inspect.sheet;
  const needsDeliverable = inspect.deliverables.length > 1;
  const ready = columnsReady(choice, needsDeliverable);
  const roleOf = (column: string): Role | null =>
    column === choice.mssvColumn ? 'mssv' : column === choice.scoreColumn ? 'score' : column === choice.reasonColumn ? 'reason' : null;
  const overwriteInView = grid && choice.scoreColumn && choice.firstDataRow ? sampledOverwriteCount(grid, choice.scoreColumn, choice.firstDataRow) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="gx-sheet" label="Trang tính">
          <select id="gx-sheet" value={choice.sheetName} onChange={(e) => onSelectSheet(e.target.value)} disabled={busy} className={SELECT_CLASS}>
            <option value="">Chọn trang tính…</option>
            {inspect.sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.hidden ? `${s.name} (ẩn)` : s.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="gx-mssv" label="Cột MSSV">
          <select id="gx-mssv" value={choice.mssvColumn} onChange={(e) => onChange({ mssvColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
            <option value="">Chọn cột…</option>
            {grid?.columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="gx-score" label="Cột điểm">
          <select id="gx-score" value={choice.scoreColumn} onChange={(e) => onChange({ scoreColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
            <option value="">Chọn cột…</option>
            {grid?.columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="gx-reason" label="Cột lý do ô trống (tuỳ chọn)" hint="Chữ lý do được ghi vào đây cho sinh viên chưa có điểm. Bỏ trống nếu không cần.">
          <select id="gx-reason" value={choice.reasonColumn} onChange={(e) => onChange({ reasonColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
            <option value="">Không dùng</option>
            {grid?.columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="gx-first-row" label="Dữ liệu bắt đầu từ dòng số" hint="Dòng của sinh viên đầu tiên — tựa đề và dòng tiêu đề nằm phía trên.">
          <input
            id="gx-first-row"
            type="number"
            min={1}
            value={choice.firstDataRow ?? ''}
            onChange={(e) => onChange({ firstDataRow: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={!grid}
            className={SELECT_CLASS}
          />
        </FormField>

        {needsDeliverable && (
          <FormField id="gx-deliverable" label="Ghi điểm của yêu cầu nộp" hint="Phiên có nhiều yêu cầu nộp; điểm không bao giờ được cộng lại.">
            <select id="gx-deliverable" value={choice.deliverableId} onChange={(e) => onChange({ deliverableId: e.target.value })} className={SELECT_CLASS}>
              <option value="">Chọn yêu cầu nộp…</option>
              {inspect.deliverables.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.requiredFilename}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      {grid?.protected && (
        <Alert variant="destructive">
          <AlertDescription>Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.</AlertDescription>
        </Alert>
      )}
      {overwriteInView > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Trong phần xem trước, {overwriteInView} ô của cột {choice.scoreColumn} đã có giá trị và sẽ bị ghi đè nếu bạn ghi điểm vào
            cột này. Số ô thật hiện ở bước sau.
          </AlertDescription>
        </Alert>
      )}

      {grid ? (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table aria-label="Xem trước file" className="w-full border-collapse text-small">
              <thead>
                <tr>
                  <th scope="col" className="w-24 border-b border-border bg-surface-2 p-2 text-left text-caption text-muted-foreground">
                    Dòng
                  </th>
                  {grid.columns.map((letter) => {
                    const role = roleOf(letter);
                    return (
                      <th
                        key={letter}
                        scope="col"
                        data-role={role ?? undefined}
                        className={`border-b border-border p-2 text-left ${role ? ROLE_CELL[role] : 'bg-surface-2'}`}
                      >
                        <span>{letter}</span>
                        {role && (
                          <>
                            {' '}
                            <span className="rounded-full border border-border bg-surface px-1.5 py-px text-caption font-semibold">{ROLE_TAG[role]}</span>
                          </>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r) => (
                  <tr
                    key={r.row}
                    data-before-data={choice.firstDataRow !== null && r.row < choice.firstDataRow ? 'true' : undefined}
                    data-first-data={r.row === choice.firstDataRow ? 'true' : undefined}
                    className={`${choice.firstDataRow !== null && r.row < choice.firstDataRow ? 'opacity-50' : ''} ${r.row === choice.firstDataRow ? 'outline outline-1 outline-accent' : ''}`}
                  >
                    <th scope="row" className="border-b border-border p-2 text-left font-normal text-muted-foreground">
                      <span className="tabular-nums">{r.row}</span>{' '}
                      <button
                        type="button"
                        aria-label={`Dữ liệu bắt đầu từ dòng ${r.row}`}
                        onClick={() => onChange({ firstDataRow: r.row })}
                        className="rounded border border-border px-1 text-caption hover:bg-surface-2"
                      >
                        từ đây
                      </button>
                    </th>
                    {r.cells.map((c, i) => {
                      const role = roleOf(grid.columns[i]!);
                      return (
                        <td key={i} data-role={role ?? undefined} className={`max-w-[220px] truncate border-b border-border p-2 ${role ? ROLE_CELL[role] : ''}`}>
                          {c.formula && (
                            <span aria-label="ô có công thức" title="Ô có công thức — hệ thống sẽ bỏ qua dòng này" className="mr-1 font-mono text-caption text-muted-foreground">
                              ƒ
                            </span>
                          )}
                          {c.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {grid.fromRow > 1 && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onLoadRows(Math.max(1, grid.fromRow - GRID_ROWS))}>
                Xem các dòng trước
              </Button>
            )}
            {grid.hasMore && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onLoadRows(grid.fromRow + grid.rows.length)}>
                Xem các dòng tiếp
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">Chọn trang tính để xem nội dung của nó.</p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="button" className="self-start" disabled={busy || !ready.ok || Boolean(grid?.protected)} onClick={onNext}>
          Xem trước điểm sẽ ghi
        </Button>
        {!ready.ok && <p className="text-caption text-muted-foreground">Còn thiếu: {ready.hints.join(', ')}.</p>}
      </div>
    </div>
  );
}
