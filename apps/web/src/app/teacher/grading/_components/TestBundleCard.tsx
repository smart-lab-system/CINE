'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBundleRuns } from '@/hooks/useBundleRuns';
import { useCreateTestBundle, useGenerateTestBundle, useTestBundles } from '@/hooks/useTestBundle';
import { useFetchTestBundle } from '@/hooks/useTestBundleDetail';
import {
  addRow,
  changesCount,
  editRow,
  nextCaseKey,
  removeRow,
  saveBlocker,
  startDraft,
  toCreateInput,
  undoRow,
  type CaseValues,
  type DraftRow,
} from '@/lib/test-case-draft';
import { BundleActions } from './BundleActions';
import { CaseForm } from './CaseForm';
import { TestBundleList } from './TestBundleList';

const DEFAULT_GROUP = 'co_ban';
const SUGGESTED_GROUPS = ['co_ban', 'bien', 'lon'];

/** Bản nháp đang sửa: một phiên bản chưa lưu. `baseVersion` null khi bắt đầu từ trống. */
interface Draft {
  /** Gói gốc của bản nháp (null khi bắt đầu từ trống): gửi kèm khi lưu để server kế thừa origin. */
  baseId: string | null;
  baseVersion: number | null;
  version: number;
  rows: DraftRow[];
}

/** Form thêm/sửa một ca đang mở. `key` đổi mỗi lần mở để form không giữ chữ của lần trước. */
interface OpenForm {
  mode: 'add' | 'edit';
  index: number | null;
  initial: CaseValues;
  key: number;
}

/**
 * Khối Gói test của một phiên (§14.1, G2b-R): ba nút sinh và chạy thử, danh sách phiên bản, và bản nháp để tạo phiên bản mới.
 *
 * Gói đã lưu là bất biến, nên mọi sửa ca đều đi qua bản nháp: bắt đầu từ một phiên bản (hay từ trống), sửa, rồi lưu thành
 * phiên bản MỚI qua route tạo gói. Lưu không duyệt và không ghim: duyệt là hành động riêng, trong hộp thoại có các ca cần đọc.
 */
export function TestBundleCard({ sessionId, pinnedBundleId }: { sessionId: string; pinnedBundleId: string | null }) {
  const bundles = useTestBundles(sessionId);
  const fetchDetail = useFetchTestBundle(sessionId);
  const createBundle = useCreateTestBundle(sessionId);
  // Nâng lên đây (không ở BundleActions) để thẻ biết đang sinh và khoá các nút chạy thử của từng phiên bản.
  const generate = useGenerateTestBundle(sessionId);
  const runs = useBundleRuns(sessionId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<OpenForm | null>(null);
  const [formSeq, setFormSeq] = useState(0);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const list = bundles.data ?? [];
  const nextVersion = list.reduce((max, b) => Math.max(max, b.version), 0) + 1;

  function openForm(mode: OpenForm['mode'], index: number | null, initial: CaseValues) {
    const key = formSeq + 1;
    setFormSeq(key);
    setForm({ mode, index, initial, key });
  }

  function startBlank() {
    setDraft({ baseId: null, baseVersion: null, version: nextVersion, rows: [] });
    setMessage('');
    setLoadError(null);
    openForm('add', null, { caseKey: nextCaseKey([]), group: DEFAULT_GROUP, input: '', expectedOutput: '' });
  }

  async function startFrom(bundleId: string) {
    if (draft) {
      setMessage('Lưu hoặc huỷ bản nháp hiện tại trước khi tạo bản mới từ một phiên bản khác.');
      return;
    }
    setLoadError(null);
    try {
      const detail = await fetchDetail(bundleId);
      setDraft({ baseId: bundleId, baseVersion: detail.version, version: nextVersion, rows: startDraft(detail.cases) });
      setForm(null);
      setMessage('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được phiên bản để sửa.');
    }
  }

  function submitForm(values: CaseValues, again: boolean) {
    if (!draft || !form) return;
    if (form.mode === 'add') {
      const rows = addRow(draft.rows, values);
      const added = rows[rows.length - 1].caseKey;
      setDraft({ ...draft, rows });
      if (again) {
        openForm('add', null, { caseKey: nextCaseKey(rows), group: values.group.trim(), input: '', expectedOutput: '' });
        setMessage(`Đã thêm ${added}. Nhập ca tiếp theo.`);
      } else {
        setForm(null);
        setMessage(`Đã thêm ${added} vào bản nháp.`);
      }
      return;
    }
    const index = form.index ?? 0;
    const rows = editRow(draft.rows, index, values);
    setDraft({ ...draft, rows });
    setForm(null);
    setMessage(`Đã lưu ca ${rows[index].caseKey} trong bản nháp.`);
  }

  function editRowAt(index: number) {
    if (!draft) return;
    const row = draft.rows[index];
    openForm('edit', index, { caseKey: row.caseKey, group: row.group, input: row.input, expectedOutput: row.expectedOutput });
    setMessage('');
  }

  function removeRowAt(index: number) {
    if (!draft) return;
    setDraft({ ...draft, rows: removeRow(draft.rows, index) });
    setMessage('');
  }

  function undoRowAt(index: number) {
    if (!draft) return;
    setDraft({ ...draft, rows: undoRow(draft.rows, index) });
    setMessage('');
  }

  function save() {
    if (!draft) return;
    createBundle.mutate(
      { cases: toCreateInput(draft.rows), derivedFromBundleId: draft.baseId ?? undefined },
      {
        onSuccess: (created) => {
          setDraft(null);
          setForm(null);
          // Số của SERVER (bản nháp có thể đã lỗi thời nếu có phiên bản khác được lưu trong lúc sửa).
          setMessage(`Đã lưu phiên bản ${created.version}. Chưa duyệt, chưa dùng để chấm.`);
        },
      },
    );
  }

  function discard() {
    setDraft(null);
    setForm(null);
    createBundle.reset(); // lỗi của lần lưu trước không đứng lại sau khi bản nháp đó đã bỏ
    setMessage('Đã huỷ bản nháp.');
  }

  // Chạy thử từ danh sách phiên bản đi qua đây để gỡ lỗi của lần sinh trước, y như nút ở khối trên (BundleActions.runWhole).
  // Không có chỗ này thì một lỗi sinh cũ đứng cạnh kết quả chạy mới ở từng dòng phiên bản.
  const runsFromList = {
    ...runs,
    run: (bundleId: string, caseKey?: string) => {
      generate.reset();
      runs.run(bundleId, caseKey);
    },
  };

  const blocker = draft ? saveBlocker(draft.rows, form !== null) : null;
  const knownGroups = Array.from(new Set([...SUGGESTED_GROUPS, ...(draft?.rows.map((r) => r.group) ?? [])]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Gói test</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BundleActions sessionId={sessionId} bundles={list} pinnedBundleId={pinnedBundleId} runs={runs} generate={generate} />
        <TestBundleList
          sessionId={sessionId}
          pinnedBundleId={pinnedBundleId}
          runs={runsFromList}
          onNewVersion={(id) => void startFrom(id)}
          generating={generate.isPending}
        />

        {!draft && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={startBlank}>
              Tạo gói bằng tay
            </Button>
          </div>
        )}

        {loadError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        {message && (
          <p role="status" className="text-small text-muted-foreground">
            {message}
          </p>
        )}
        {createBundle.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{createBundle.error?.message}</AlertDescription>
          </Alert>
        )}

        {draft && (
          <section aria-label="Bản nháp" className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
            <div>
              <p className="text-small font-semibold">Bản nháp · sẽ lưu thành phiên bản {draft.version}</p>
              <p className="text-caption text-muted-foreground">
                {draft.baseVersion !== null ? `Từ phiên bản ${draft.baseVersion}. ` : 'Bắt đầu từ trống. '}
                Chưa lưu thì chưa thành phiên bản mới.
              </p>
            </div>

            {form && (
              <CaseForm
                key={form.key}
                mode={form.mode}
                initial={form.initial}
                rows={draft.rows}
                editingIndex={form.index}
                knownGroups={knownGroups}
                onSubmit={submitForm}
                onCancel={() => {
                  setForm(null);
                  setMessage('');
                }}
              />
            )}

            {draft.rows.length === 0 ? (
              <p className="text-small text-muted-foreground">Chưa có ca nào. Bấm Thêm ca để gõ ca đầu tiên.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-small">
                  <caption className="sr-only">Các ca của bản nháp</caption>
                  <thead>
                    <tr className="text-caption text-muted-foreground">
                      <th scope="col" className="py-1 pr-2">Ca</th>
                      <th scope="col" className="py-1 pr-2">Nhóm</th>
                      <th scope="col" className="py-1 pr-2">Input</th>
                      <th scope="col" className="py-1 pr-2">Output mong đợi</th>
                      <th scope="col" className="py-1 pr-2">Trích đề</th>
                      <th scope="col" className="py-1 pr-2">Trạng thái</th>
                      <th scope="col" className="py-1"><span className="sr-only">Thao tác</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((row, index) => (
                      <DraftRowView
                        key={`${index}-${row.caseKey}`}
                        row={row}
                        locked={form !== null}
                        onEdit={() => editRowAt(index)}
                        onRemove={() => removeRowAt(index)}
                        onUndo={() => undoRowAt(index)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <div>
                <p className="text-small">{changesCount(draft.rows)} thay đổi</p>
                {blocker && <p className="text-caption font-medium text-warning-strong">{blocker}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={form !== null} onClick={() => openForm('add', null, { caseKey: nextCaseKey(draft.rows), group: DEFAULT_GROUP, input: '', expectedOutput: '' })}>
                  Thêm ca
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={discard}>
                  Huỷ bản nháp
                </Button>
                <Button type="button" size="sm" disabled={blocker !== null} loading={createBundle.isPending} onClick={save}>
                  Lưu thành phiên bản {draft.version}
                </Button>
              </div>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function DraftRowView({
  row,
  locked,
  onEdit,
  onRemove,
  onUndo,
}: {
  row: DraftRow;
  locked: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUndo: () => void;
}) {
  const dropped = row.state === 'dropped';
  const removed = row.state === 'removed';
  return (
    <tr className={dropped || removed ? 'text-muted-foreground line-through' : ''}>
      <td className="break-all py-1 pr-2 align-top font-mono text-caption">{row.caseKey}</td>
      <td className="py-1 pr-2 align-top">{row.group}</td>
      <td className="break-all py-1 pr-2 align-top font-mono text-caption whitespace-pre-wrap">{row.input}</td>
      <td className="break-all py-1 pr-2 align-top font-mono text-caption whitespace-pre-wrap">{dropped ? '—' : row.expectedOutput}</td>
      <td className="py-1 pr-2 align-top">
        {dropped
          ? `Hệ thống đã bỏ: ${row.autoDroppedReason}`
          : row.constraintQuote
            ? `“${row.constraintQuote}”`
            : <span className="text-muted-foreground">Chưa có trích đề</span>}
      </td>
      <td className="py-1 pr-2 align-top">
        {row.state === 'added' && <Badge variant="accent">Mới</Badge>}
        {row.state === 'edited' && <Badge variant="warning">Đã sửa</Badge>}
        {removed && <Badge variant="outline">Sẽ bỏ</Badge>}
        {dropped && <Badge variant="outline">Hệ thống bỏ</Badge>}
      </td>
      <td className="py-1 align-top">
        {removed ? (
          <Button type="button" size="sm" variant="ghost" aria-label={`Hoàn tác ca ${row.caseKey}`} disabled={locked} onClick={onUndo}>
            Hoàn tác
          </Button>
        ) : dropped ? null : (
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="ghost" aria-label={`Sửa ca ${row.caseKey}`} disabled={locked} onClick={onEdit}>
              Sửa
            </Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Bỏ ca ${row.caseKey}`} disabled={locked} onClick={onRemove}>
              Bỏ
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
