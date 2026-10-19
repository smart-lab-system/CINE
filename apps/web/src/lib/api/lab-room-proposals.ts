import { getAccessToken } from '@/lib/auth-token';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class LabRoomProposalHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LabRoomProposalHttpError';
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message =
      res.status === 409
        ? 'Xung đột dữ liệu (trùng mã phòng).'
        : `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(', ');
    } catch {
      /* ignore */
    }
    throw new LabRoomProposalHttpError(message, res.status);
  }
  if (res.headers.get('content-type')?.includes('json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export type LabRoomProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface LabRoomProposal {
  id: string;
  status: LabRoomProposalStatus;
  code: string;
  name: string;
  capacity: number;
  building: string | null;
  floor: string | null;
  proposedByAccountId: string;
  proposedByEmail: string;
  proposedByDisplayName: string | null;
  machineCount: number;
  note: string | null;
  createdRoomId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export type LabRoomProposalMachineStatus = 'active' | 'maintenance' | 'inactive';

export interface LabRoomProposalMachine {
  id: string;
  machineId: string;
  hostname: string;
  cpu: string;
  ramGb: number;
  storage: string;
  gpu: string | null;
  os: string;
  localIp: string;
  macAddress: string;
  status: LabRoomProposalMachineStatus;
  studentMssv: string | null;
  studentFullName: string | null;
  role: string;
  lastSeenAt: string | null;
  sortOrder: number;
}

export interface LabRoomProposalDetail extends LabRoomProposal {
  machines: LabRoomProposalMachine[];
}

export function listRoomProposals(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<LabRoomProposal[]>(`/ide-extensions/lab/room-proposals${q}`);
}

export function getRoomProposal(id: string) {
  return fetchJson<LabRoomProposalDetail>(`/ide-extensions/lab/room-proposals/${id}`);
}

export function rejectRoomProposal(id: string, note?: string) {
  return fetchJson<LabRoomProposalDetail>(`/ide-extensions/lab/room-proposals/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function acceptCreateRoom(
  id: string,
  body?: {
    code?: string;
    name?: string;
    capacity?: number;
    building?: string | null;
    floor?: string | null;
    note?: string | null;
  },
) {
  return fetchJson<{ roomId: string; proposal: LabRoomProposalDetail }>(
    `/ide-extensions/lab/room-proposals/${id}/accept-create-room`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    },
  );
}
