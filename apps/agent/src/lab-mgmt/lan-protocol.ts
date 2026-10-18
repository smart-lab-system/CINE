/**
 * Hợp đồng LAN v1 — spec §4.1.
 * Port cố định theo plan (đổi một chỗ nếu conflict phòng máy).
 */

export const LAB_MGMT_UDP_PORT = 41780;
export const LAB_MGMT_TCP_PORT = 41781;

export const LAB_MGMT_ADVERTISE_MAGIC = 'cine-lab-mgmt-hub-v1';

export type LabCommandName = 'SCAN_VSCODE_EXTENSIONS' | 'PING' | 'GET_MACHINE_INFO';

export interface LabCommandRequest {
  requestId: string;
  command: LabCommandName;
  payload?: unknown;
  issuedAt: string;
}

export interface LabCommandResponse {
  requestId: string;
  ok: boolean;
  error?: string;
  payload?: unknown;
  machineId: string;
  mssv: string;
}

export type LabWireMessage =
  | { type: 'register'; machine: LabMachineInfo }
  | { type: 'command'; request: LabCommandRequest }
  | { type: 'command_response'; response: LabCommandResponse }
  | { type: 'hub_reject'; existingHostname: string; message: string }
  | { type: 'hub_hello'; sessionId: string; hostname: string };

export interface LabMachineInfo {
  machineId: string;
  hostname: string;
  localIp: string;
  role: 'teacher_hub' | 'student_node';
  studentMssv?: string;
  /** Họ tên từ catalog student sau lookup §2.3 */
  studentFullName?: string;
  teacherAccountId?: string;
  teacherEmail?: string;
  labMgmtSessionId: string;
  appVersion: string;
  os: string;
  lastSeen: string;
  /** Phần cứng auto-collect — gửi kèm register / GET_MACHINE_INFO */
  cpu?: string;
  ramGb?: number;
  storage?: string;
  gpu?: string | null;
  macAddress?: string;
}

export interface HubAdvertisePayload {
  magic: typeof LAB_MGMT_ADVERTISE_MAGIC;
  sessionId: string;
  hostname: string;
  tcpPort: number;
  teacherEmail?: string;
}

export function parseWireMessage(raw: string): LabWireMessage | null {
  try {
    const parsed = JSON.parse(raw) as LabWireMessage;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeWireMessage(msg: LabWireMessage): string {
  return `${JSON.stringify(msg)}\n`;
}
