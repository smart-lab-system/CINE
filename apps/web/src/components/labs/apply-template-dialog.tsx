'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiFetchJson } from '@/lib/api-fetch';
import {
  layoutDataToEditorSeats,
  type SeatingTemplateDetail,
  type SeatingTemplateListItem,
} from './seating-template-utils';

const SeatingCanvas = dynamic(
  () => import('./seating-canvas').then((m) => m.SeatingCanvas),
  { ssr: false },
);

export function ApplyTemplateDialog({
  open,
  canvasWidth,
  canvasHeight,
  applying,
  onClose,
  onApply,
}: {
  open: boolean;
  canvasWidth: number;
  canvasHeight: number;
  applying?: boolean;
  onClose: () => void;
  onApply: (input: {
    templateId: string;
    mode: 'replace' | 'append';
    matchCanvas: boolean;
  }) => void;
}) {
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [matchCanvas, setMatchCanvas] = useState(false);

  const listQuery = useQuery({
    queryKey: ['seating-templates', search],
    enabled: open,
    queryFn: () =>
      apiFetchJson<{ items: SeatingTemplateListItem[]; total: number }>(
        `/seating-templates?search=${encodeURIComponent(search)}&page=1&pageSize=50`,
      ),
  });

  const detailQuery = useQuery({
    queryKey: ['seating-templates', selectedId],
    enabled: open && Boolean(selectedId),
    queryFn: () =>
      apiFetchJson<SeatingTemplateDetail>(
        `/seating-templates/${selectedId}`,
      ),
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const previewWidth = matchCanvas
    ? (detailQuery.data?.canvasWidth ?? canvasWidth)
    : canvasWidth;
  const previewHeight = matchCanvas
    ? (detailQuery.data?.canvasHeight ?? canvasHeight)
    : canvasHeight;

  const previewSeats = useMemo(() => {
    if (!detailQuery.data) return [];
    return layoutDataToEditorSeats(
      detailQuery.data.layoutData,
      previewWidth,
      previewHeight,
      'preview',
    );
  }, [detailQuery.data, previewWidth, previewHeight]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 isolate flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground opacity-100 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              Áp dụng / Nhập từ mẫu
            </h2>
            <p className="text-xs text-muted-foreground">
              Chọn sơ đồ mẫu để nhân bản ghế (chưa gắn máy trạm) vào phòng hiện
              tại.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/seating-templates">Quản lý mẫu</Link>
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Tìm mẫu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            ) : listQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                Không tải được danh sách mẫu.
              </p>
            ) : (listQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có sơ đồ mẫu.{' '}
                <Link href="/seating-templates/new" className="underline">
                  Tạo mẫu
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {listQuery.data?.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={
                        selectedId === item.id
                          ? 'w-full rounded-md bg-secondary px-3 py-2 text-left text-sm font-medium'
                          : 'w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary/60'
                      }
                    >
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-xs">
                        {item.canvasWidth}×{item.canvasHeight} · {item.seatCount}{' '}
                        ghế
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">
                Chọn một mẫu bên trái để xem trước.
              </p>
            ) : detailQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải mẫu…</p>
            ) : detailQuery.error || !detailQuery.data ? (
              <p role="alert" className="text-sm text-destructive">
                Không tải được mẫu.
              </p>
            ) : (
              <SeatingCanvas
                canvasWidth={previewWidth}
                canvasHeight={previewHeight}
                seats={previewSeats}
                selectedIds={[]}
                workstations={[]}
                editable={false}
                showLegend={false}
                onSelectionChange={() => undefined}
                onMoveSeats={() => undefined}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[10rem] flex-col gap-1">
              <Label htmlFor="apply-mode">Cách áp dụng</Label>
              <Select
                id="apply-mode"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as 'replace' | 'append')
                }
              >
                <option value="replace">Thay thế ghế hiện tại</option>
                <option value="append">Thêm vào sơ đồ hiện tại</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={matchCanvas}
                onChange={(e) => setMatchCanvas(e.target.checked)}
              />
              Đổi kích thước canvas theo mẫu
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={!selectedId || applying}
              onClick={() => {
                if (!selectedId) return;
                if (mode === 'replace') {
                  const ok = window.confirm(
                    'Áp dụng mẫu sẽ thay ghế hiện tại bằng bản sao chưa gắn máy trạm. Tiếp tục?',
                  );
                  if (!ok) return;
                }
                onApply({ templateId: selectedId, mode, matchCanvas });
              }}
            >
              {applying ? 'Đang áp dụng…' : 'Áp dụng mẫu'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
