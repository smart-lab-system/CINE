'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNominalClasses } from '@/hooks/useMasterData';
import {
  createStudent,
  listStudents,
  MasterDataHttpError,
  type Student,
} from '@/lib/api/master-data';
import type { RosterEntry } from '@/lib/api/roster';
import { cn } from '@/lib/utils';

export type AddStudentPayload = RosterEntry | { studentId: string };

const EIGHT_DIGIT_MSSV = /^\d{8}$/;

type Props = {
  isPending: boolean;
  errorMessage?: string | null;
  /** Bật gợi ý / tạo catalog (admin). Teacher để tắt. */
  catalogAssist?: boolean;
  onAdd: (payload: AddStudentPayload) => void | Promise<void>;
};

/**
 * Thêm một SV vào roster. Với `catalogAssist`: gõ để gợi ý từ DB, khớp MSSV
 * 8 số thì tự điền tên; chưa có thì báo và tạo catalog (cần lớp danh nghĩa).
 */
export function ManualAddStudentForm({
  isPending,
  errorMessage,
  catalogAssist = false,
  onAdd,
}: Props) {
  const [mssv, setMssv] = useState('');
  const [name, setName] = useState('');
  const [matched, setMatched] = useState<Student | null>(null);
  const [nominalClassId, setNominalClassId] = useState('');
  const [openSuggest, setOpenSuggest] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const mssvTrim = mssv.trim();
  const isEightDigit = EIGHT_DIGIT_MSSV.test(mssvTrim);

  const searchSource = mssvTrim.length >= 2 ? mssvTrim : name.trim();
  const debouncedQ = useDebouncedValue(searchSource, 300);
  const searchEnabled = catalogAssist && debouncedQ.length >= 2;

  const suggestions = useQuery({
    queryKey: ['md-students', 'roster-suggest', debouncedQ],
    queryFn: () =>
      listStudents({
        page: 1,
        pageSize: 10,
        search: debouncedQ,
        status: 'active',
      }),
    enabled: searchEnabled,
  });

  const classes = useNominalClasses({
    page: 1,
    pageSize: 100,
    status: 'active',
  });

  const classOptions = useMemo(
    () =>
      (classes.data?.items ?? []).map((c) => ({
        value: c.id,
        label: c.name ? `${c.code} — ${c.name}` : c.code,
        keywords: `${c.code} ${c.name ?? ''}`,
      })),
    [classes.data?.items],
  );

  const items = suggestions.data?.items ?? [];

  // Chỉ đối chiếu catalog khi đã đủ 8 chữ số.
  useEffect(() => {
    if (!catalogAssist) return;
    if (!isEightDigit) {
      setMatched(null);
      return;
    }
    const exact = items.find((s) => s.mssv.toLowerCase() === mssvTrim.toLowerCase());
    if (exact) {
      setMatched(exact);
      setName(exact.fullName);
      return;
    }
    setMatched(null);
  }, [catalogAssist, isEightDigit, mssvTrim, items]);

  useEffect(() => {
    if (!openSuggest) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenSuggest(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openSuggest]);

  const lookingUp = catalogAssist && searchEnabled && suggestions.isFetching;
  const exactInResults = items.some(
    (s) => s.mssv.toLowerCase() === mssvTrim.toLowerCase(),
  );
  const isNew =
    catalogAssist &&
    isEightDigit &&
    !matched &&
    !lookingUp &&
    !exactInResults;

  function pick(student: Student) {
    setMssv(student.mssv);
    setName(student.fullName);
    setMatched(student);
    setOpenSuggest(false);
  }

  function reset() {
    setMssv('');
    setName('');
    setMatched(null);
    setNominalClassId('');
    setOpenSuggest(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const m = mssv.trim();
    const n = name.trim();
    if (!m || !n) {
      toast.error('Nhập MSSV và họ tên');
      return;
    }

    try {
      if (
        catalogAssist &&
        matched &&
        matched.mssv.toLowerCase() === m.toLowerCase()
      ) {
        await onAdd({ studentId: matched.id });
        reset();
        return;
      }

      if (catalogAssist && isNew) {
        if (!nominalClassId) {
          toast.error('Chọn lớp danh nghĩa để tạo sinh viên mới');
          return;
        }
        setCreating(true);
        const created = await createStudent({
          mssv: m,
          fullName: n,
          nominalClassId,
          status: 'active',
        });
        toast.success(`Đã tạo sinh viên mới ${m} trong catalog`);
        await onAdd({ studentId: created.id });
        reset();
        return;
      }

      await onAdd({ mssv: m, name: n });
      reset();
    } catch (e) {
      if (!(e instanceof Error) || !errorMessage) {
        toast.error(
          e instanceof MasterDataHttpError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Thêm sinh viên thất bại',
        );
      }
    } finally {
      setCreating(false);
    }
  }

  const busy = isPending || creating;

  return (
    <div className="flex flex-col gap-4">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {catalogAssist && isNew ? (
        <Alert variant="info">
          <AlertDescription>
            Sinh viên <span className="font-mono">{mssvTrim}</span> chưa có trong hệ
            thống — sẽ tạo mới rồi thêm vào lớp.
          </AlertDescription>
        </Alert>
      ) : null}

      {catalogAssist && matched ? (
        <p className="text-caption text-muted-foreground">
          Đã khớp catalog: <span className="font-mono">{matched.mssv}</span> —{' '}
          {matched.fullName}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => void submit(e)}
        autoComplete="off"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div ref={rootRef} className="relative flex w-full flex-col gap-1.5 lg:w-40 lg:shrink-0">
            <Label htmlFor="manual-mssv">MSSV</Label>
            <Input
              id="manual-mssv"
              required
              className="font-mono"
              placeholder="vd: 22691861"
              value={mssv}
              onChange={(e) => {
                setMssv(e.target.value);
                setOpenSuggest(true);
                if (
                  matched &&
                  e.target.value.trim().toLowerCase() !== matched.mssv.toLowerCase()
                ) {
                  setMatched(null);
                }
              }}
              onFocus={() => setOpenSuggest(true)}
            />
            {catalogAssist && openSuggest && (items.length > 0 || lookingUp) ? (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {lookingUp && items.length === 0 ? (
                  <li className="px-2 py-1.5 text-sm text-muted-foreground">Đang tìm…</li>
                ) : (
                  items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        className={cn(
                          'flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent-subtle',
                          matched?.id === s.id && 'bg-accent-subtle',
                        )}
                        onClick={() => pick(s)}
                      >
                        <span className="font-mono font-medium">{s.mssv}</span>
                        <span className="text-muted-foreground">{s.fullName}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-1.5 lg:w-52 lg:shrink-0">
            <Label htmlFor="manual-name">Họ và tên</Label>
            <Input
              id="manual-name"
              required
              placeholder="vd: Nguyễn Văn A"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (catalogAssist && !matched) setOpenSuggest(true);
              }}
              onFocus={() => {
                if (catalogAssist) setOpenSuggest(true);
              }}
              readOnly={Boolean(matched)}
              className={matched ? 'bg-muted' : undefined}
            />
          </div>

          {catalogAssist && isNew ? (
            <div className="flex min-w-0 flex-[2] flex-col gap-1.5">
              <Label>Lớp danh nghĩa (tạo SV mới)</Label>
              <SearchableSelect
                value={nominalClassId}
                onValueChange={setNominalClassId}
                options={classOptions}
                placeholder="Chọn lớp…"
                searchPlaceholder="Gõ mã hoặc tên lớp…"
                ariaLabel="Chọn lớp danh nghĩa"
              />
            </div>
          ) : null}

          <Button type="submit" loading={busy} className="shrink-0 lg:mb-0">
            Thêm
          </Button>
        </div>
      </form>
    </div>
  );
}
