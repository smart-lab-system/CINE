'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSaveRubric } from '@/hooks/useGrading';
import type { Rubric } from '@/lib/api/grading';
import { formatVnPoints } from '@/lib/format';
import {
  approachesFromRubric,
  buildSaveQsInput,
  hasQsErrors,
  maxApproachCaps,
  newQsApproach,
  newQsStep,
  sumApproachCaps,
  validateQsRubric,
  type QsApproachRow,
} from '@/lib/qs-rubric-form';
import { parseCap } from '@/lib/rubric-form';

export function QsRubricForm({
  rubric,
  existingNames,
  onSaved,
  onClose,
  seedName,
  seedApproaches,
}: {
  rubric?: Rubric;
  existingNames: string[];
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
  seedName?: string;
  seedApproaches?: QsApproachRow[];
}) {
  const seq = useRef(0);
  const nextId = () => `qs-${++seq.current}`;
  const editing = rubric !== undefined;

  const [name, setName] = useState(seedName ?? '');
  const [approaches, setApproaches] = useState<QsApproachRow[]>(() => {
    if (rubric) return approachesFromRubric(rubric);
    if (seedApproaches?.length) return seedApproaches;
    return [newQsApproach(nextId(), nextId())];
  });
  const [totalPoints, setTotalPoints] = useState(() => {
    if (rubric) return String(rubric.totalPoints);
    const max = maxApproachCaps(seedApproaches ?? []);
    return max > 0 ? String(max) : '10';
  });
  const [active, setActive] = useState(0);
  const save = useSaveRubric();

  const errors = validateQsRubric(
    { name, nameEditable: !editing, existingNames, totalPoints },
    approaches,
  );
  const busy = save.isPending;
  const canSave = !hasQsErrors(errors) && !busy;
  const displayMax = maxApproachCaps(approaches);

  const patchApproach = (id: string, patch: Partial<QsApproachRow>) =>
    setApproaches((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const patchStep = (approachId: string, stepId: string, patch: Partial<QsApproachRow['steps'][0]>) =>
    setApproaches((prev) =>
      prev.map((a) =>
        a.id !== approachId
          ? a
          : { ...a, steps: a.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) },
      ),
    );

  const current = approaches[active] ?? approaches[0];

  function submit() {
    if (!canSave) return;
    const payload = buildSaveQsInput(editing ? rubric!.name : name, approaches);
    save.mutate(payload, {
      onSuccess: (saved) => {
        toast.success(editing ? 'Đã lưu phiên bản QS mới.' : 'Đã tạo rubric QS.');
        onSaved(saved);
        onClose();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Không lưu được.'),
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Sửa rubric QS' : 'Tạo rubric QS'}</DialogTitle>
      </DialogHeader>

      <Alert>
        <AlertDescription>
          QS: điểm đề = hướng đạt cao nhất ({formatVnPoints(displayMax)} /{' '}
          {parseCap(totalPoints) ?? '—'} điểm trần UI). Không cộng dồn mọi hướng.
        </AlertDescription>
      </Alert>

      {!editing ? (
        <FormField id="qs-name" label="Tên rubric" error={errors.name}>
          <Input
            id="qs-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="VD: 01_largest_product"
          />
        </FormField>
      ) : (
        <p className="text-sm text-muted-foreground">
          Rubric: <span className="font-medium text-foreground">{rubric.name}</span> — lưu sẽ tạo phiên
          bản mới.
        </p>
      )}

      <FormField id="qs-total" label="Tổng điểm (trần UI)" error={errors.totalPoints}>
        <Input
          id="qs-total"
          value={totalPoints}
          onChange={(e) => setTotalPoints(e.target.value)}
          className="max-w-[8rem]"
        />
      </FormField>

      {errors.general ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {approaches.map((a, i) => (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={i === active ? 'default' : 'outline'}
            onClick={() => setActive(i)}
          >
            {a.name.trim() || `Hướng ${i + 1}`} ({formatVnPoints(sumApproachCaps(a))})
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={approaches.length >= 20}
          onClick={() => {
            setApproaches((prev) => [...prev, newQsApproach(nextId(), nextId())]);
            setActive(approaches.length);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Thêm hướng
        </Button>
      </div>

      {current ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-end gap-3">
            <FormField
              id={`ap-name-${current.id}`}
              label="Tên hướng"
              className="min-w-[12rem] flex-1"
              error={errors.approaches[current.id]?.name}
            >
              <Input
                id={`ap-name-${current.id}`}
                value={current.name}
                onChange={(e) => patchApproach(current.id, { name: e.target.value })}
              />
            </FormField>
            {!current.existing ? (
              <FormField
                id={`ap-key-${current.id}`}
                label="Khoá (tuỳ chọn)"
                className="w-40"
                error={errors.approaches[current.id]?.key}
              >
                <Input
                  id={`ap-key-${current.id}`}
                  value={current.key}
                  onChange={(e) => patchApproach(current.id, { key: e.target.value })}
                />
              </FormField>
            ) : (
              <p className="pb-2 text-xs text-muted-foreground">Khoá: {current.key}</p>
            )}
            {approaches.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Xóa hướng"
                onClick={() => {
                  setApproaches((prev) => prev.filter((a) => a.id !== current.id));
                  setActive((i) => Math.max(0, i - 1));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {errors.approaches[current.id]?.steps ? (
            <p className="text-sm text-destructive">{errors.approaches[current.id]?.steps}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Bước checklist</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={current.steps.length >= 30}
                onClick={() =>
                  patchApproach(current.id, {
                    steps: [...current.steps, newQsStep(nextId())],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm bước
              </Button>
            </div>

            {current.steps.map((step, si) => {
              const se = errors.approaches[current.id]?.stepsById?.[step.id];
              return (
                <div
                  key={step.id}
                  className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_6rem_auto]"
                >
                  <FormField
                    id={`st-desc-${step.id}`}
                    label={`Bước ${si + 1}`}
                    error={se?.description}
                  >
                    <Input
                      id={`st-desc-${step.id}`}
                      value={step.description}
                      onChange={(e) =>
                        patchStep(current.id, step.id, { description: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField id={`st-pts-${step.id}`} label="Điểm" error={se?.maxPoints}>
                    <Input
                      id={`st-pts-${step.id}`}
                      value={step.maxPoints}
                      onChange={(e) =>
                        patchStep(current.id, step.id, { maxPoints: e.target.value })
                      }
                    />
                  </FormField>
                  <div className="flex items-end">
                    {current.steps.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa bước ${si + 1}`}
                        onClick={() =>
                          patchApproach(current.id, {
                            steps: current.steps.filter((s) => s.id !== step.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="h-10 w-10" />
                    )}
                  </div>
                  {!step.existing ? (
                    <FormField
                      id={`st-key-${step.id}`}
                      label="Khoá bước (tuỳ chọn)"
                      className="sm:col-span-3"
                      error={se?.key}
                    >
                      <Input
                        id={`st-key-${step.id}`}
                        value={step.key}
                        onChange={(e) =>
                          patchStep(current.id, step.id, { key: e.target.value })
                        }
                      />
                    </FormField>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="button" onClick={submit} disabled={!canSave}>
          {busy ? 'Đang lưu…' : editing ? 'Lưu phiên bản QS' : 'Tạo rubric QS'}
        </Button>
      </DialogFooter>
    </>
  );
}
