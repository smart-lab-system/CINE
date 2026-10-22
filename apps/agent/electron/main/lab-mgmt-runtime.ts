/**
 * Lifecycle Teacher Hub / Student Node trong main process.
 * Token JWT chỉ giữ ở đây — không đưa xuống renderer.
 */

import type { BrowserWindow } from 'electron';
import { TeacherHub } from '../../src/lab-mgmt/teacher-hub';
import { StudentNode } from '../../src/lab-mgmt/student-node';
import {
  clearMachineHardwareCache,
  collectMachineHardware,
} from '../../src/lab-mgmt/machine-hardware';
import { loadOrCreateMachineId } from '../../src/lab-mgmt/machine-identity';
import {
  aggregateRoom,
  compareAllowlist,
  readExtensionActivity,
  refreshMachines,
  scanExtensions,
  type MachineComparison,
  type RoomAggregate,
} from '../../src/lab-mgmt/hub-actions';
import type { EffectiveExtension } from '../../src/lab-mgmt/allowlist-compare';
import { downloadViolationVsixFiles } from '../../src/lab-mgmt/violation-vsix';
import { IPC_CHANNELS, type VsixDownloadResult } from '../shared/ipc';

export class LabMgmtRuntime {
  private hub: TeacherHub | null = null;
  private node: StudentNode | null = null;
  private machineId: string;
  private courseId: string | null = null;
  private lastComparisons: MachineComparison[] = [];
  private lastEffective: EffectiveExtension[] = [];

  constructor(
    private readonly backendUrl: string,
    private readonly userDataPath: string,
    private readonly getWindow: () => BrowserWindow | null,
  ) {
    this.machineId = loadOrCreateMachineId(userDataPath);
  }

  async loginTeacher(email: string, password: string): Promise<{ ok: boolean; error?: string; email?: string }> {
    await this.stop();
    let res: Response;
    try {
      res = await fetch(`${this.backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      return {
        ok: false,
        error: `Không kết nối được máy chủ (${err instanceof Error ? err.message : String(err)}).`,
      };
    }
    if (!res.ok) {
      return { ok: false, error: 'Email hoặc mật khẩu không đúng, hoặc tài khoản bị khoá.' };
    }
    const body = (await res.json()) as {
      accessToken: string;
      account: { id: string; email: string; name?: string; role: string };
    };
    if (body.account.role !== 'teacher' && body.account.role !== 'admin') {
      return { ok: false, error: 'Tài khoản không phải giảng viên/admin.' };
    }

    this.hub = new TeacherHub(this.machineId, {
      accountId: body.account.id,
      email: body.account.email,
      displayName: body.account.name,
      accessToken: body.accessToken,
    });
    this.hub.on('state', (state) => {
      this.getWindow()?.webContents.send(IPC_CHANNELS.mgmtHubState, state);
    });
    try {
      await this.hub.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.stop();
      if (msg.includes('EADDRINUSE')) {
        return {
          ok: false,
          error:
            'Cổng Hub đã bị chiếm — có thể máy giảng viên khác đang chạy trên LAN này. Chỉ một Hub mỗi phòng.',
        };
      }
      return { ok: false, error: `Không khởi động được Hub: ${msg}` };
    }
    return { ok: true, email: body.account.email };
  }

  async startStudentNode(
    mssv: string,
  ): Promise<{ ok: boolean; error?: string; mssv?: string; fullName?: string }> {
    await this.stop();
    const cleaned = mssv.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (cleaned.length < 4) {
      return { ok: false, error: 'MSSV không hợp lệ.' };
    }

    let student: { mssv: string; fullName: string };
    try {
      const res = await fetch(
        `${this.backendUrl}/ide-extensions/lab/students/by-mssv/${encodeURIComponent(cleaned)}`,
      );
      if (res.status === 404) {
        const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
        return {
          ok: false,
          error: msg ?? `Không tìm thấy sinh viên với MSSV ${cleaned} trong hệ thống.`,
        };
      }
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
        return {
          ok: false,
          error: msg ?? 'Tài khoản sinh viên không còn hiệu lực.',
        };
      }
      if (!res.ok) {
        return { ok: false, error: `Không kiểm tra được MSSV (HTTP ${res.status}).` };
      }
      const body = (await res.json()) as { mssv: string; fullName: string };
      student = { mssv: body.mssv, fullName: body.fullName };
    } catch (err) {
      return {
        ok: false,
        error: `Không kết nối được máy chủ để kiểm tra MSSV (${err instanceof Error ? err.message : String(err)}).`,
      };
    }

    this.node = new StudentNode(this.machineId, student.mssv, student.fullName);
    this.node.on('state', (state) => {
      this.getWindow()?.webContents.send(IPC_CHANNELS.mgmtNodeState, state);
    });
    this.node.start();
    return { ok: true, mssv: student.mssv, fullName: student.fullName };
  }

  async stop(): Promise<void> {
    if (this.hub) {
      await this.hub.stop();
      this.hub = null;
    }
    if (this.node) {
      this.node.stop();
      this.node = null;
    }
    this.lastComparisons = [];
    this.lastEffective = [];
  }

  getHubState() {
    return this.hub?.getState() ?? null;
  }

  getNodeState() {
    return this.node?.getState() ?? null;
  }

  setCourseId(courseId: string | null): void {
    this.courseId = courseId && courseId.trim() ? courseId.trim() : null;
  }

  refreshMachines(): void {
    if (!this.hub) return;
    refreshMachines(this.hub);
  }

  async scanExtensions(machineIds?: string[]): Promise<void> {
    if (!this.hub) return;
    await scanExtensions(this.hub, machineIds);
  }

  async readExtensionActivity(machineIds?: string[]): Promise<void> {
    if (!this.hub) return;
    await readExtensionActivity(this.hub, machineIds);
  }

  async downloadViolationVsix(downloadsDir: string): Promise<VsixDownloadResult> {
    if (!this.hub) {
      return { ok: false, error: 'Hub chưa chạy.', entries: [] };
    }
    if (this.lastComparisons.length === 0) {
      return {
        ok: false,
        error: 'Chưa đối chiếu — bấm «Đối chiếu allowlist» trước.',
        entries: [],
      };
    }
    const report = await downloadViolationVsixFiles({
      comparisons: this.lastComparisons,
      downloadsDir,
    });
    return { ok: true, folder: report.folder, entries: report.entries };
  }

  async compareAllowlist(): Promise<{
    comparisons: MachineComparison[];
    courseId: string | null;
    warning?: string;
  }> {
    if (!this.hub) {
      return { comparisons: [], courseId: this.courseId, warning: 'Hub chưa chạy.' };
    }
    const token = this.hub.getAccessToken();
    const qs = this.courseId
      ? `?courseId=${encodeURIComponent(this.courseId)}`
      : '';
    let effective: EffectiveExtension[] = [];
    let warning: string | undefined;
    try {
      const res = await fetch(`${this.backendUrl}/ide-extensions/effective${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as {
          items: EffectiveExtension[];
          courseId: string | null;
          warning?: string;
        };
        effective = body.items ?? [];
        warning = body.warning;
        if (!this.courseId && !body.courseId) {
          warning =
            warning ??
            'Chưa chọn môn — chỉ áp dụng allowlist toàn trường (global).';
        }
      } else {
        warning = `Không tải được allowlist (HTTP ${res.status}).`;
      }
    } catch (err) {
      warning = `Không tải được allowlist: ${err instanceof Error ? err.message : String(err)}`;
    }

    this.lastEffective = effective;
    this.lastComparisons = compareAllowlist(this.hub.getState().nodes, effective);
    return { comparisons: this.lastComparisons, courseId: this.courseId, warning };
  }

  aggregate(): RoomAggregate | null {
    if (this.lastComparisons.length === 0) return null;
    return aggregateRoom(this.lastComparisons);
  }

  async syncBackend(): Promise<{ ok: boolean; error?: string }> {
    if (!this.hub) {
      return { ok: false, error: 'Hub chưa chạy.' };
    }
    if (this.lastComparisons.length === 0) {
      return { ok: false, error: 'Chưa đối chiếu — bấm «Đối chiếu allowlist» trước khi đồng bộ.' };
    }
    const hubState = this.hub.getState();
    const body = {
      labMgmtSessionId: hubState.sessionId,
      courseId: this.courseId,
      teacherAccountId: this.hub.getTeacherAccountId(),
      machines: hubState.nodes.map((n) => ({
        machineId: n.machineId,
        role: n.role,
        hostname: n.hostname,
        localIp: n.localIp,
        studentMssv: n.studentMssv ?? null,
        lastSeenAt: n.lastSeen,
      })),
      scans: this.lastComparisons
        .filter((c) => c.rows.length > 0)
        .map((c) => ({
          studentMssv: c.studentMssv,
          machineId: c.machineId,
          machineName: c.hostname,
          scannedAt: new Date().toISOString(),
          extensionCount: c.extensionCount,
          violationCount: c.violationCount,
          status: c.status,
          items: c.rows.map((r) => ({
            extensionId: r.extensionId,
            displayName: r.displayName ?? null,
            version: r.version,
            verdict: r.verdict,
            matchedScope: r.matchedScope,
            isBuiltin: false,
          })),
        })),
      effectiveExtensionCount: this.lastEffective.length,
    };

    try {
      const res = await fetch(`${this.backendUrl}/ide-extensions/scans/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.hub.getAccessToken()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { ok: false, error: `Đồng bộ thất bại (HTTP ${res.status}).` };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: `Đồng bộ thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getRoomProposalPreview() {
    if (!this.hub) return null;
    clearMachineHardwareCache();
    await this.hub.refreshNodesHardware();
    const hubHw = await collectMachineHardware({ force: true });
    return {
      sessionId: this.hub.sessionId,
      machines: this.hub.buildRoomProposalMachines(hubHw),
    };
  }

  async proposeRoom(input: {
    code: string;
    name: string;
    capacity: number;
    building?: string | null;
    floor?: string | null;
    note?: string | null;
    machines: Array<{
      machineId: string;
      hostname: string;
      cpu: string;
      ramGb: number;
      storage: string;
      gpu?: string | null;
      os: string;
      localIp: string;
      macAddress: string;
      status: 'active' | 'maintenance' | 'inactive';
      role: 'teacher_hub' | 'student_node';
      studentMssv?: string | null;
      studentFullName?: string | null;
      lastSeenAt?: string | null;
    }>;
  }): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
    if (!this.hub) {
      return { ok: false, error: 'Hub chưa chạy.' };
    }
    if (!input.machines?.length) {
      return { ok: false, error: 'Không có máy nào để đề xuất.' };
    }
    try {
      const res = await fetch(`${this.backendUrl}/ide-extensions/lab/room-proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.hub.getAccessToken()}`,
        },
        body: JSON.stringify({
          code: input.code,
          name: input.name,
          capacity: input.capacity,
          building: input.building ?? null,
          floor: input.floor ?? null,
          note: input.note ?? null,
          labMgmtSessionId: this.hub.sessionId,
          machines: input.machines.map((m) => ({
            machineId: m.machineId,
            hostname: m.hostname,
            cpu: m.cpu,
            ramGb: m.ramGb,
            storage: m.storage,
            gpu: m.gpu ?? null,
            os: m.os,
            localIp: m.localIp,
            macAddress: m.macAddress,
            status: m.status,
            role: m.role,
            studentMssv: m.studentMssv ?? null,
            studentFullName: m.studentFullName ?? null,
            lastSeenAt: m.lastSeenAt ?? null,
          })),
        }),
      });
      if (!res.ok) {
        let message = `Gửi đề xuất thất bại (HTTP ${res.status}).`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (typeof body.message === 'string') message = body.message;
          else if (Array.isArray(body.message)) message = body.message.join(', ');
        } catch {
          /* ignore */
        }
        return { ok: false, error: message };
      }
      const body = (await res.json()) as { id?: string };
      return { ok: true, proposalId: body.id };
    } catch (err) {
      return {
        ok: false,
        error: `Gửi đề xuất thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
