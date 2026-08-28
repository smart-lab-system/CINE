'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetchJson } from '@/lib/api-fetch';

interface LabRoomProposalDevice {
  role: 'tutor' | 'client';
  machineId: string;
  hostname: string;
  macAddress: string;
  osEdition: string;
  osVersion: string;
  serial: string;
  ipv4?: string;
  username?: string;
}

interface LabRoomProposalListItem {
  id: string;
  roomCode: string;
  roomName: string;
  building: string | null;
  floor: string | null;
  devices: LabRoomProposalDevice[];
  submittedBy: string | null;
  submittedByName: string | null;
  createdAt: string;
}

function formatOsLabel(osEdition: string, osVersion: string): string {
  const parts = [osEdition, osVersion].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('vi-VN');
}

function roleLabel(role: LabRoomProposalDevice['role']): string {
  return role === 'tutor' ? 'Giảng viên' : 'Học viên';
}

export function LabRoomProposalsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();

  const listQuery = useQuery({
    queryKey: ['lab-room-proposals', search],
    enabled: open,
    queryFn: () =>
      apiFetchJson<{ items: LabRoomProposalListItem[]; total: number }>(
        `/lab-room-proposals?search=${encodeURIComponent(search)}&page=1&pageSize=50`,
      ),
  });

  const detailQuery = useQuery({
    queryKey: ['lab-room-proposals', selectedId],
    enabled: open && Boolean(selectedId),
    queryFn: () =>
      apiFetchJson<LabRoomProposalListItem>(`/lab-room-proposals/${selectedId}`),
  });

  const createLabMutation = useMutation({
    mutationFn: async (proposalId: string) =>
      apiFetchJson<{ labId: string; code: string; workstationCount: number }>(
        `/lab-room-proposals/${proposalId}/create-lab`,
        { method: 'POST' },
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['labs'] });
      onClose();
      router.push(`/labs/${result.labId}`);
    },
    onError: (error: Error) => {
      setNotice(error.message);
    },
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

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch('');
      setNotice(undefined);
    }
  }, [open]);

  if (!open) return null;

  const selected = detailQuery.data;

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
        <div className="border-b px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold">
            Đề xuất thông tin phòng lab
          </h2>
          <p className="text-xs text-muted-foreground">
            Dữ liệu do ứng dụng giảng viên gửi lên sau khi quét máy trạm trong
            phòng.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Tìm mã / tên phòng…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            ) : listQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                Không tải được danh sách đề xuất.
              </p>
            ) : (listQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có đề xuất nào từ ứng dụng giảng viên.
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
                      <span className="block truncate font-medium">
                        {item.roomCode}
                      </span>
                      <span className="block truncate text-xs">
                        {item.roomName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)} · {item.devices.length}{' '}
                        máy
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
                Chọn một đề xuất bên trái để xem chi tiết.
              </p>
            ) : detailQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải chi tiết…</p>
            ) : detailQuery.error || !selected ? (
              <p role="alert" className="text-sm text-destructive">
                Không tải được đề xuất.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Mã phòng</dt>
                    <dd className="font-medium">{selected.roomCode}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tên phòng</dt>
                    <dd>{selected.roomName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tòa / Tầng</dt>
                    <dd>
                      {[selected.building, selected.floor]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Gửi bởi</dt>
                    <dd>{selected.submittedByName || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Thời gian gửi</dt>
                    <dd>{formatDateTime(selected.createdAt)}</dd>
                  </div>
                </dl>

                <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vai trò</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>MAC</TableHead>
                        <TableHead>Hệ điều hành</TableHead>
                        <TableHead>Serial</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.devices.map((device) => (
                        <TableRow key={`${device.role}-${device.machineId}`}>
                          <TableCell>{roleLabel(device.role)}</TableCell>
                          <TableCell>{device.hostname || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {device.macAddress || '—'}
                          </TableCell>
                          <TableCell>
                            {formatOsLabel(device.osEdition, device.osVersion)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {device.serial || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {notice ? (
                  <p role="alert" className="text-sm text-destructive">
                    {notice}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {selected
              ? `Sẽ tạo phòng máy và ${selected.devices.length} máy trạm từ đề xuất này.`
              : 'Chọn đề xuất để tạo phòng máy.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button
              type="button"
              disabled={!selectedId || createLabMutation.isPending}
              onClick={() => {
                if (!selected) return;
                const ok = window.confirm(
                  `Tạo phòng máy "${selected.roomCode}" với ${selected.devices.length} máy trạm?`,
                );
                if (!ok) return;
                setNotice(undefined);
                createLabMutation.mutate(selected.id);
              }}
            >
              {createLabMutation.isPending ? 'Đang tạo…' : 'Tạo phòng máy'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
