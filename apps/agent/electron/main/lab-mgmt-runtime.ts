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
import { getHostname, loadOrCreateMachineId } from '../../src/lab-mgmt/machine-identity';
import type { HubTeacherIdentity } from '../../src/lab-mgmt/teacher-hub';
import {
  loadMachineRoleCache,
  saveMachineRoleCache,
  type CachedMachineRole,
} from '../../src/lab-mgmt/machine-role-cache';
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
import { createHash } from 'node:crypto';
import {
  collectSyncArtifactTargets,
  downloadMarketplaceVsixBuffer,
  downloadViolationVsixFiles,
} from '../../src/lab-mgmt/violation-vsix';
import { IPC_CHANNELS, type SyncResultPayload, type VsixDownloadResult } from '../shared/ipc';

export class LabMgmtRuntime {
  private hub: TeacherHub | null = null;
  private node: StudentNode | null = null;
  private machineId: string;
  private courseId: string | null = null;
  private examSessionId: string | null = null;
  private roomId: string | null = null;
  private examLabel: string | null = null;
  private pendingTeacher: HubTeacherIdentity | null = null;
  /** Phòng của máy GV đã khớp lúc login (null = bootstrap chưa gắn máy GV). */
  private verifiedTeacherRoomId: string | null = null;
  private lastComparisons: MachineComparison[] = [];
  private lastEffective: EffectiveExtension[] = [];

  constructor(
    private readonly backendUrl: string,
    private readonly userDataPath: string,
    private readonly getWindow: () => BrowserWindow | null,
  ) {
    this.machineId = loadOrCreateMachineId(userDataPath);
  }

  /** Mở app: nếu đã cache role thì bật LAN Hub/Node ngay (kể cả offline). */
  async bootstrapLanFromCache(): Promise<void> {
    const cached = loadMachineRoleCache(this.userDataPath);
    if (!cached) return;
    await this.ensureLanForRole(cached.role);
    if (cached.roomId) this.verifiedTeacherRoomId = cached.roomId;
  }

  /**
   * Phân loại máy (online → ghi cache; offline → đọc cache) rồi đảm bảo LAN chạy.
   */
  async resolveMachineRole(): Promise<{
    ok: boolean;
    error?: string;
    role?: 'teacher' | 'student' | 'unknown';
    reason?: string;
    roomId?: string | null;
    fromCache?: boolean;
  }> {
    const hw = await collectMachineHardware({ force: true });
    try {
      const res = await fetch(`${this.backendUrl}/ide-extensions/lab/resolve-machine-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: this.machineId,
          hostname: getHostname(),
          macAddress: hw.macAddress,
        }),
      });
      if (!res.ok) {
        return this.resolveMachineRoleFromCache(
          `Không xác định được loại máy (HTTP ${res.status}).`,
        );
      }
      const body = (await res.json()) as {
        role: 'teacher' | 'student' | 'unknown';
        reason?: string;
        roomId?: string | null;
        computerId?: string | null;
      };
      if (body.role === 'teacher' || body.role === 'student') {
        saveMachineRoleCache(this.userDataPath, {
          role: body.role,
          roomId: body.roomId ?? null,
          computerId: body.computerId ?? null,
          reason: body.reason ?? null,
        });
        if (body.roomId) this.verifiedTeacherRoomId = body.roomId;
        await this.ensureLanForRole(body.role);
      }
      return {
        ok: true,
        role: body.role,
        reason: body.reason,
        roomId: body.roomId ?? null,
        fromCache: false,
      };
    } catch {
      return this.resolveMachineRoleFromCache(
        'Không kết nối được máy chủ — dùng vai trò máy đã lưu trên máy này.',
      );
    }
  }

  private async resolveMachineRoleFromCache(offlineHint: string): Promise<{
    ok: boolean;
    error?: string;
    role?: 'teacher' | 'student' | 'unknown';
    reason?: string;
    roomId?: string | null;
    fromCache?: boolean;
  }> {
    const cached = loadMachineRoleCache(this.userDataPath);
    if (!cached) {
      return {
        ok: false,
        error:
          `${offlineHint} Chưa có bản ghi vai trò máy local — cần online ít nhất một lần khi máy đã có trong catalog.`,
      };
    }
    if (cached.roomId) this.verifiedTeacherRoomId = cached.roomId;
    await this.ensureLanForRole(cached.role);
    return {
      ok: true,
      role: cached.role,
      reason: cached.reason ?? 'cached',
      roomId: cached.roomId,
      fromCache: true,
    };
  }

  private async ensureLanForRole(role: CachedMachineRole): Promise<void> {
    if (role === 'teacher') {
      await this.ensureTeacherLan();
      return;
    }
    await this.ensureStudentLan();
  }

  private stubTeacherIdentity(): HubTeacherIdentity {
    return {
      accountId: 'local-pending',
      email: 'chưa-đăng-nhập',
      displayName: 'Chưa đăng nhập',
      accessToken: '',
    };
  }

  private async ensureTeacherLan(): Promise<{ ok: boolean; error?: string }> {
    if (this.node) {
      this.node.stop();
      this.node = null;
    }
    if (this.hub) return { ok: true };
    this.hub = new TeacherHub(this.machineId, this.pendingTeacher ?? this.stubTeacherIdentity());
    this.hub.on('state', (state) => {
      this.getWindow()?.webContents.send(IPC_CHANNELS.mgmtHubState, state);
    });
    try {
      await this.hub.start();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.stopHubOnly();
      if (msg.includes('EADDRINUSE')) {
        return {
          ok: false,
          error:
            'Cổng Hub đã bị chiếm — có thể máy giảng viên khác đang chạy trên LAN này. Chỉ một Hub mỗi phòng.',
        };
      }
      return { ok: false, error: `Không khởi động được Hub: ${msg}` };
    }
  }

  private async ensureStudentLan(): Promise<void> {
    if (this.hub) {
      await this.stopHubOnly();
    }
    if (this.node) return;
    this.node = new StudentNode(this.machineId, '', 'Chưa đăng nhập');
    this.node.on('state', (state) => {
      this.getWindow()?.webContents.send(IPC_CHANNELS.mgmtNodeState, state);
    });
    this.node.start();
  }

  /**
   * Auth + chặn ngay nếu không phải máy GV / máy thuộc phòng chưa có máy GV.
   * Không tắt LAN Hub nếu đã chạy.
   */
  async loginTeacher(email: string, password: string): Promise<{ ok: boolean; error?: string; email?: string }> {
    if (this.node) {
      this.node.stop();
      this.node = null;
    }
    this.pendingTeacher = null;
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

    const hw = await collectMachineHardware({ force: true });
    try {
      const verifyRes = await fetch(`${this.backendUrl}/ide-extensions/lab/teacher-machine/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${body.accessToken}`,
        },
        body: JSON.stringify({
          machineId: this.machineId,
          hostname: getHostname(),
          macAddress: hw.macAddress,
        }),
      });
      if (!verifyRes.ok) {
        return {
          ok: false,
          error: `Không kiểm tra được máy giảng viên (HTTP ${verifyRes.status}).`,
        };
      }
      const verdict = (await verifyRes.json()) as {
        ok: boolean;
        reason?: string;
        teacherMachine?: { roomId?: string | null } | null;
      };
      if (!verdict.ok) {
        return {
          ok: false,
          error:
            'Máy này không được phép đăng nhập giảng viên. Chỉ máy GV đã gắn, hoặc máy thuộc phòng chưa có máy GV, mới đăng nhập được.',
        };
      }
      this.verifiedTeacherRoomId = verdict.teacherMachine?.roomId?.trim() || null;
    } catch (err) {
      return {
        ok: false,
        error: `Không kiểm tra được máy giảng viên: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    this.pendingTeacher = {
      accountId: body.account.id,
      email: body.account.email,
      displayName: body.account.name,
      accessToken: body.accessToken,
    };
    if (this.verifiedTeacherRoomId) {
      const cached = loadMachineRoleCache(this.userDataPath);
      saveMachineRoleCache(this.userDataPath, {
        role: 'teacher',
        roomId: this.verifiedTeacherRoomId,
        computerId: cached?.computerId ?? null,
        reason: 'login_verified',
      });
    }
    const lan = await this.ensureTeacherLan();
    if (!lan.ok) return { ok: false, error: lan.error };
    this.hub?.updateTeacher(this.pendingTeacher);
    return { ok: true, email: body.account.email };
  }

  async listTodayExamSessions(): Promise<{
    ok: boolean;
    error?: string;
    items?: Array<{
      id: string;
      name: string;
      code: string;
      courseName: string;
      roomName: string;
      roomId: string | null;
      courseId: string | null;
      startTime: string;
      endTime: string;
      status: string;
    }>;
  }> {
    if (!this.pendingTeacher) {
      return { ok: false, error: 'Chưa đăng nhập giảng viên.' };
    }
    try {
      const res = await fetch(`${this.backendUrl}/exam-sessions/mgmt/today`, {
        headers: { Authorization: `Bearer ${this.pendingTeacher.accessToken}` },
      });
      if (!res.ok) {
        return { ok: false, error: `Không tải được kỳ thi hôm nay (HTTP ${res.status}).` };
      }
      const body = (await res.json()) as { items: Array<Record<string, unknown>> };
      let items = (body.items ?? []).map((it) => ({
        id: String(it.id),
        name: String(it.name ?? ''),
        code: String(it.code ?? ''),
        courseName: String(it.courseName ?? ''),
        roomName: String(it.roomName ?? ''),
        roomId: (it.roomId as string | null) ?? null,
        courseId: (it.courseId as string | null) ?? null,
        startTime: String(it.startTime ?? ''),
        endTime: String(it.endTime ?? ''),
        status: String(it.status ?? ''),
      }));
      // Chỉ hiện kỳ thi cùng phòng với máy GV đã xác thực lúc login.
      if (this.verifiedTeacherRoomId) {
        items = items.filter(
          (it) => !it.roomId || it.roomId === this.verifiedTeacherRoomId,
        );
      }
      return { ok: true, items };
    } catch (err) {
      return {
        ok: false,
        error: `Không tải được kỳ thi: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async startTeacherHub(opts?: {
    examSessionId?: string | null;
    courseId?: string | null;
    roomId?: string | null;
    examLabel?: string | null;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this.pendingTeacher) {
      return { ok: false, error: 'Chưa đăng nhập giảng viên.' };
    }

    const roomId = opts?.roomId?.trim() || null;
    if (
      this.verifiedTeacherRoomId &&
      roomId &&
      roomId !== this.verifiedTeacherRoomId
    ) {
      return {
        ok: false,
        error: 'Kỳ thi thuộc phòng khác với máy giảng viên bạn đang đăng nhập.',
      };
    }
    const hw = await collectMachineHardware({ force: true });
    try {
      const verifyRes = await fetch(`${this.backendUrl}/ide-extensions/lab/teacher-machine/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pendingTeacher.accessToken}`,
        },
        body: JSON.stringify({
          machineId: this.machineId,
          roomId,
          hostname: getHostname(),
          macAddress: hw.macAddress,
        }),
      });
      if (!verifyRes.ok) {
        return {
          ok: false,
          error: `Không kiểm tra được máy giảng viên (HTTP ${verifyRes.status}).`,
        };
      }
      const verdict = (await verifyRes.json()) as { ok: boolean; reason?: string };
      if (!verdict.ok) {
        return {
          ok: false,
          error:
            'Máy này không phải máy giảng viên của phòng kỳ thi. Chỉ máy GV đã gắn trong quản lý phòng máy mới mở được Teacher Hub.',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Không kiểm tra được máy giảng viên: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    this.courseId = opts?.courseId?.trim() || null;
    this.examSessionId = opts?.examSessionId?.trim() || null;
    this.roomId = roomId;
    this.examLabel = opts?.examLabel?.trim() || null;

    const lan = await this.ensureTeacherLan();
    if (!lan.ok) return lan;
    this.hub?.updateTeacher(this.pendingTeacher);
    return { ok: true };
  }

  getMgmtContext() {
    return {
      courseId: this.courseId,
      examSessionId: this.examSessionId,
      roomId: this.roomId,
      examLabel: this.examLabel,
    };
  }

  private async stopHubOnly(): Promise<void> {
    if (this.hub) {
      await this.hub.stop();
      this.hub = null;
    }
  }

  async startStudentNode(
    mssv: string,
  ): Promise<{ ok: boolean; error?: string; mssv?: string; fullName?: string }> {
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

    await this.ensureStudentLan();
    saveMachineRoleCache(this.userDataPath, {
      role: 'student',
      roomId: loadMachineRoleCache(this.userDataPath)?.roomId ?? null,
      computerId: loadMachineRoleCache(this.userDataPath)?.computerId ?? null,
      reason: 'student_login',
    });
    this.node?.bindStudent(student.mssv, student.fullName);
    return { ok: true, mssv: student.mssv, fullName: student.fullName };
  }

  /** Rời màn hình đăng nhập/hub — giữ LAN Hub/Node. */
  async leaveSession(): Promise<void> {
    this.pendingTeacher = null;
    this.courseId = null;
    this.examSessionId = null;
    this.examLabel = null;
    this.roomId = null;
    this.lastComparisons = [];
    this.lastEffective = [];
    if (this.hub) {
      this.hub.updateTeacher(this.stubTeacherIdentity());
    }
    if (this.node) {
      this.node.bindStudent('', 'Chưa đăng nhập');
    }
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
    this.pendingTeacher = null;
    this.verifiedTeacherRoomId = null;
    this.courseId = null;
    this.examSessionId = null;
    this.roomId = null;
    this.examLabel = null;
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

  async syncBackend(): Promise<SyncResultPayload> {
    if (!this.hub) {
      return { ok: false, error: 'Hub chưa chạy.' };
    }
    if (this.lastComparisons.length === 0) {
      return { ok: false, error: 'Chưa đối chiếu — bấm «Đối chiếu allowlist» trước khi đồng bộ.' };
    }
    const hubState = this.hub.getState();
    const token = this.hub.getAccessToken();
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const body = {
      labMgmtSessionId: hubState.sessionId,
      courseId: this.courseId,
      examSessionId: this.examSessionId,
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
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { ok: false, error: `Đồng bộ thất bại (HTTP ${res.status}).` };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Đồng bộ thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Best-effort VSIX artifacts — never fails the scan sync above.
    const artifact = await this.syncVsixArtifacts(authHeaders);
    return { ok: true, artifact };
  }

  private async syncVsixArtifacts(authHeaders: {
    'Content-Type': string;
    Authorization: string;
  }): Promise<{ uploaded: number; skipped: number; failed: number }> {
    const items = collectSyncArtifactTargets(this.lastComparisons);
    if (items.length === 0) {
      return { uploaded: 0, skipped: 0, failed: 0 };
    }

    let skipped = 0;
    let uploaded = 0;
    let failed = 0;

    try {
      const ensureRes = await fetch(`${this.backendUrl}/ide-extensions/catalog/ensure-artifacts`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ items }),
      });
      if (!ensureRes.ok) {
        return { uploaded: 0, skipped: 0, failed: items.length };
      }
      const ensureBody = (await ensureRes.json()) as {
        needed: Array<{
          versionId: string;
          extensionId: string;
          version: string;
          storageKey: string;
          uploadUrl: string;
        }>;
        skipped: number;
      };
      skipped = ensureBody.skipped ?? 0;

      for (const need of ensureBody.needed ?? []) {
        try {
          const downloaded = await downloadMarketplaceVsixBuffer(need.extensionId, need.version);
          if (!downloaded.ok) {
            failed += 1;
            continue;
          }
          // Node Buffer is not in DOM BodyInit; copy into Uint8Array (same as backup/uploader).
          const body = new Uint8Array(downloaded.buffer);
          const put = await fetch(need.uploadUrl, {
            method: 'PUT',
            body,
          });
          if (!put.ok) {
            failed += 1;
            continue;
          }
          const sha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
          const confirm = await fetch(
            `${this.backendUrl}/ide-extensions/versions/${need.versionId}/confirm-artifact`,
            {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                storageKey: need.storageKey,
                sha256,
                sizeBytes: body.byteLength,
              }),
            },
          );
          if (!confirm.ok) {
            failed += 1;
            continue;
          }
          uploaded += 1;
        } catch {
          failed += 1;
        }
      }
    } catch {
      return { uploaded: 0, skipped: 0, failed: items.length };
    }

    return { uploaded, skipped, failed };
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
