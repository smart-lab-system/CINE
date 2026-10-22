/**
 * The IPC contract between `electron/main` and `electron/renderer`,
 * declared once so both sides (and `electron/preload`) agree on channel
 * names and payload shapes.
 */

import type { AgentState } from '../../src/session-controller';
import type { MachineComparison, RoomAggregate } from '../../src/lab-mgmt/hub-actions';
import type { VsixDownloadEntry } from '../../src/lab-mgmt/violation-vsix';
import type { TeacherHubState } from '../../src/lab-mgmt/teacher-hub';
import type { StudentNodeState } from '../../src/lab-mgmt/student-node';
import type { EffectiveExtension } from '../../src/lab-mgmt/allowlist-compare';

export const IPC_CHANNELS = {
  join: 'agent:join',
  sendAccessRequest: 'agent:send-access-request',
  minimizeToTray: 'agent:minimize-to-tray',
  quit: 'agent:quit',
  state: 'agent:state',
  getState: 'agent:get-state',

  /** Module Quản lý */
  mgmtLoginTeacher: 'mgmt:login-teacher',
  mgmtStartStudentNode: 'mgmt:start-student-node',
  mgmtStop: 'mgmt:stop',
  mgmtGetHubState: 'mgmt:get-hub-state',
  mgmtGetNodeState: 'mgmt:get-node-state',
  mgmtHubState: 'mgmt:hub-state',
  mgmtNodeState: 'mgmt:node-state',
  mgmtRefreshMachines: 'mgmt:refresh-machines',
  mgmtScanExtensions: 'mgmt:scan-extensions',
  mgmtReadExtensionActivity: 'mgmt:read-extension-activity',
  mgmtDownloadViolationVsix: 'mgmt:download-violation-vsix',
  mgmtCompareAllowlist: 'mgmt:compare-allowlist',
  mgmtAggregateRoom: 'mgmt:aggregate-room',
  mgmtSyncBackend: 'mgmt:sync-backend',
  mgmtSetCourseId: 'mgmt:set-course-id',
  mgmtGetRoomProposalPreview: 'mgmt:get-room-proposal-preview',
  mgmtProposeRoom: 'mgmt:propose-room',
  setUiMode: 'ui:set-mode',
} as const;

export interface JoinRequest {
  studentId: string;
  sessionCode: string;
}

export interface SendAccessRequestRequest {
  fullName: string;
  reason: string;
}

export interface TeacherLoginRequest {
  email: string;
  password: string;
}

export interface TeacherLoginResult {
  ok: boolean;
  error?: string;
  email?: string;
}

export interface StartStudentNodeRequest {
  mssv: string;
}

export interface StartStudentNodeResult {
  ok: boolean;
  error?: string;
  mssv?: string;
  fullName?: string;
}

export interface CompareResultPayload {
  comparisons: MachineComparison[];
  courseId: string | null;
  warning?: string;
}

export interface SyncResultPayload {
  ok: boolean;
  error?: string;
}

export interface VsixDownloadResult {
  ok: boolean;
  error?: string;
  folder?: string;
  entries: VsixDownloadEntry[];
}

export type RoomProposalMachineStatus = 'active' | 'maintenance' | 'inactive';

/** Máy gửi kèm đề xuất — đủ field parity `computer` (§5.1), auto-collect. */
export interface RoomProposalMachinePayload {
  machineId: string;
  hostname: string;
  cpu: string;
  ramGb: number;
  storage: string;
  gpu?: string | null;
  os: string;
  localIp: string;
  macAddress: string;
  status: RoomProposalMachineStatus;
  role: 'teacher_hub' | 'student_node';
  studentMssv?: string | null;
  studentFullName?: string | null;
  lastSeenAt?: string | null;
}

export type RoomProposalMachinePreview = RoomProposalMachinePayload;

export interface RoomProposalPreviewPayload {
  sessionId: string;
  machines: RoomProposalMachinePreview[];
}

export interface ProposeRoomRequest {
  code: string;
  name: string;
  capacity: number;
  building?: string | null;
  floor?: string | null;
  note?: string | null;
  machines: RoomProposalMachinePayload[];
}

export interface ProposeRoomResult {
  ok: boolean;
  error?: string;
  proposalId?: string;
}

/** The typed surface `electron/preload` exposes as `window.agent`. */
export interface AgentApi {
  join(payload: JoinRequest): void;
  sendAccessRequest(payload: SendAccessRequestRequest): void;
  minimizeToTray(): void;
  quit(): void;
  onState(callback: (state: AgentState) => void): () => void;
  getState(): Promise<AgentState>;

  mgmtLoginTeacher(payload: TeacherLoginRequest): Promise<TeacherLoginResult>;
  mgmtStartStudentNode(payload: StartStudentNodeRequest): Promise<StartStudentNodeResult>;
  mgmtStop(): Promise<void>;
  mgmtGetHubState(): Promise<TeacherHubState | null>;
  mgmtGetNodeState(): Promise<StudentNodeState | null>;
  onHubState(callback: (state: TeacherHubState) => void): () => void;
  onNodeState(callback: (state: StudentNodeState) => void): () => void;
  mgmtRefreshMachines(): Promise<void>;
  mgmtScanExtensions(machineIds?: string[]): Promise<void>;
  mgmtReadExtensionActivity(machineIds?: string[]): Promise<void>;
  mgmtDownloadViolationVsix(): Promise<VsixDownloadResult>;
  mgmtCompareAllowlist(): Promise<CompareResultPayload>;
  mgmtAggregateRoom(): Promise<RoomAggregate | null>;
  mgmtSyncBackend(): Promise<SyncResultPayload>;
  mgmtSetCourseId(courseId: string | null): Promise<void>;
  mgmtGetRoomProposalPreview(): Promise<RoomProposalPreviewPayload | null>;
  mgmtProposeRoom(payload: ProposeRoomRequest): Promise<ProposeRoomResult>;
  setUiMode(mode: UiMode): Promise<void>;
}

export type UiMode = 'landing' | 'exam' | 'mgmt';

export type { TeacherHubState, StudentNodeState, EffectiveExtension, MachineComparison, RoomAggregate };
