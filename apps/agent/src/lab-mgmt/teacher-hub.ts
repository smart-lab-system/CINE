import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { createServer, type Server, type Socket as TcpSocket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  encodeWireMessage,
  LAB_MGMT_ADVERTISE_MAGIC,
  LAB_MGMT_TCP_PORT,
  LAB_MGMT_UDP_PORT,
  parseWireMessage,
  type HubAdvertisePayload,
  type LabCommandName,
  type LabCommandRequest,
  type LabCommandResponse,
  type LabMachineInfo,
} from './lan-protocol';
import {
  collectMachineHardware,
  type MachineHardwareInfo,
} from './machine-hardware';
import { APP_VERSION, getHostname, getLocalIp, getOsLabel } from './machine-identity';
import type { ScannedExtension } from './vscode-extensions-scan';

export interface HubTeacherIdentity {
  accountId: string;
  email: string;
  displayName?: string;
  accessToken: string;
}

export interface RegisteredNode extends LabMachineInfo {
  /** Inventory thô sau khi quét — chỉ set khi GV bấm Quét. */
  inventory?: ScannedExtension[];
  inventoryError?: string;
  inventoryAt?: string;
}

export interface TeacherHubState {
  sessionId: string;
  hostname: string;
  localIp: string;
  teacherEmail: string;
  nodes: RegisteredNode[];
  statusMessage: string | null;
}

/**
 * Teacher Hub LAN — advertise UDP + TCP command server.
 * Nghiệp vụ quét/đối chiếu/sync chỉ chạy khi caller gọi method (nút UI).
 */
export class TeacherHub extends EventEmitter {
  readonly sessionId = randomUUID();
  private readonly nodes = new Map<string, RegisteredNode>();
  private readonly sockets = new Map<string, TcpSocket>();
  private readonly pending = new Map<
    string,
    { resolve: (r: LabCommandResponse) => void; reject: (e: Error) => void }
  >();
  private udp: UdpSocket | null = null;
  private tcp: Server | null = null;
  private advertiseTimer: ReturnType<typeof setInterval> | null = null;
  private statusMessage: string | null = null;

  constructor(
    private readonly machineId: string,
    private readonly teacher: HubTeacherIdentity,
  ) {
    super();
  }

  getState(): TeacherHubState {
    return {
      sessionId: this.sessionId,
      hostname: getHostname(),
      localIp: getLocalIp(),
      teacherEmail: this.teacher.email,
      nodes: [...this.nodes.values()].sort((a, b) =>
        (a.studentMssv ?? '').localeCompare(b.studentMssv ?? ''),
      ),
      statusMessage: this.statusMessage,
    };
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }

  async start(): Promise<void> {
    await this.startTcp();
    this.startUdpAdvertise();
    this.statusMessage = 'Hub đang chạy — chờ máy sinh viên kết nối.';
    this.emitState();
  }

  async stop(): Promise<void> {
    if (this.advertiseTimer) {
      clearInterval(this.advertiseTimer);
      this.advertiseTimer = null;
    }
    this.udp?.close();
    this.udp = null;
    for (const sock of this.sockets.values()) {
      sock.destroy();
    }
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      if (!this.tcp) {
        resolve();
        return;
      }
      this.tcp.close(() => resolve());
    });
    this.tcp = null;
  }

  /** Nút «Làm mới danh sách máy» — chỉ emit lại registry hiện có. */
  refreshRegistry(): void {
    this.statusMessage = `Đã làm mới — ${this.nodes.size} máy.`;
    this.emitState();
  }

  async sendCommand(
    command: LabCommandName,
    machineIds?: string[],
  ): Promise<LabCommandResponse[]> {
    const targets =
      machineIds && machineIds.length > 0
        ? machineIds
        : [...this.sockets.keys()];
    const results: LabCommandResponse[] = [];
    for (const id of targets) {
      const sock = this.sockets.get(id);
      if (!sock) {
        results.push({
          requestId: randomUUID(),
          ok: false,
          error: 'Máy không còn kết nối.',
          machineId: id,
          mssv: this.nodes.get(id)?.studentMssv ?? '',
        });
        continue;
      }
      const request: LabCommandRequest = {
        requestId: randomUUID(),
        command,
        issuedAt: new Date().toISOString(),
      };
      const response = await this.sendRequest(sock, id, request);
      results.push(response);
      if (command === 'SCAN_VSCODE_EXTENSIONS') {
        this.applyScanResponse(id, response);
      }
    }
    this.emitState();
    return results;
  }

  getAccessToken(): string {
    return this.teacher.accessToken;
  }

  getTeacherAccountId(): string {
    return this.teacher.accountId;
  }

  getTeacherEmail(): string {
    return this.teacher.email;
  }

  getTeacherDisplayName(): string | undefined {
    return this.teacher.displayName;
  }

  /**
   * Gửi GET_MACHINE_INFO tới mọi node để bổ sung/làm mới phần cứng
   * (CPU, RAM, ổ cứng, GPU, MAC…).
   */
  async refreshNodesHardware(): Promise<void> {
    const tasks = [...this.sockets.entries()].map(async ([id, sock]) => {
      try {
        const response = await this.sendRequest(sock, id, {
          requestId: randomUUID(),
          command: 'GET_MACHINE_INFO',
          issuedAt: new Date().toISOString(),
        });
        if (!response.ok || !response.payload || typeof response.payload !== 'object') {
          return;
        }
        const p = response.payload as Partial<LabMachineInfo>;
        const node = this.nodes.get(id);
        if (!node) return;
        if (p.hostname) node.hostname = p.hostname;
        if (p.localIp) node.localIp = p.localIp;
        if (p.os) node.os = p.os;
        if (p.cpu) node.cpu = p.cpu;
        if (typeof p.ramGb === 'number') node.ramGb = p.ramGb;
        if (p.storage) node.storage = p.storage;
        if (p.gpu !== undefined) node.gpu = p.gpu;
        if (p.macAddress) node.macAddress = p.macAddress;
        node.lastSeen = new Date().toISOString();
      } catch {
        /* giữ snapshot cũ nếu node không trả lời */
      }
    });
    await Promise.all(tasks);
    this.emitState();
  }

  /** Snapshot đề xuất phòng: máy Hub + mọi node SV (§5.1) — đủ field Máy tính. */
  buildRoomProposalMachines(hubHw: MachineHardwareInfo): Array<{
    machineId: string;
    hostname: string;
    cpu: string;
    ramGb: number;
    storage: string;
    gpu: string | null;
    os: string;
    localIp: string;
    macAddress: string;
    status: 'active';
    role: 'teacher_hub' | 'student_node';
    studentMssv?: string | null;
    studentFullName?: string | null;
    lastSeenAt: string;
  }> {
    const hub = {
      machineId: this.machineId,
      hostname: hubHw.hostname,
      cpu: hubHw.cpu,
      ramGb: hubHw.ramGb,
      storage: hubHw.storage,
      gpu: hubHw.gpu,
      os: hubHw.os,
      localIp: hubHw.localIp,
      macAddress: hubHw.macAddress,
      status: 'active' as const,
      role: 'teacher_hub' as const,
      studentMssv: null,
      studentFullName: null,
      lastSeenAt: new Date().toISOString(),
    };
    const nodes = [...this.nodes.values()].map((n) => ({
      machineId: n.machineId,
      hostname: n.hostname,
      cpu: n.cpu ?? '',
      ramGb: n.ramGb ?? 0,
      storage: n.storage ?? '',
      gpu: n.gpu ?? null,
      os: n.os,
      localIp: n.localIp,
      macAddress: n.macAddress ?? '',
      status: 'active' as const,
      role: 'student_node' as const,
      studentMssv: n.studentMssv ?? null,
      studentFullName: n.studentFullName ?? null,
      lastSeenAt: n.lastSeen,
    }));
    return [hub, ...nodes];
  }

  private applyScanResponse(machineId: string, response: LabCommandResponse): void {
    const node = this.nodes.get(machineId);
    if (!node) return;
    if (!response.ok) {
      node.inventoryError = response.error ?? 'Quét thất bại';
      node.inventory = undefined;
      node.inventoryAt = new Date().toISOString();
      return;
    }
    const payload = response.payload as { extensions?: ScannedExtension[] } | undefined;
    node.inventory = payload?.extensions ?? [];
    node.inventoryError = undefined;
    node.inventoryAt = new Date().toISOString();
  }

  private sendRequest(
    sock: TcpSocket,
    machineId: string,
    request: LabCommandRequest,
  ): Promise<LabCommandResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new Error('Hết thời gian chờ phản hồi từ máy sinh viên.'));
      }, 30_000);
      this.pending.set(request.requestId, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      sock.write(encodeWireMessage({ type: 'command', request }));
      void machineId;
    });
  }

  private startUdpAdvertise(): void {
    this.udp = createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.bind(LAB_MGMT_UDP_PORT, () => {
      try {
        this.udp?.setBroadcast(true);
      } catch {
        /* một số NIC không cho broadcast — vẫn thử gửi */
      }
      this.advertiseOnce();
      this.advertiseTimer = setInterval(() => this.advertiseOnce(), 2000);
    });
  }

  private advertiseOnce(): void {
    if (!this.udp) return;
    const payload: HubAdvertisePayload = {
      magic: LAB_MGMT_ADVERTISE_MAGIC,
      sessionId: this.sessionId,
      hostname: getHostname(),
      tcpPort: LAB_MGMT_TCP_PORT,
      teacherEmail: this.teacher.email,
    };
    const buf = Buffer.from(JSON.stringify(payload), 'utf8');
    this.udp.send(buf, 0, buf.length, LAB_MGMT_UDP_PORT, '255.255.255.255');
  }

  private startTcp(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcp = createServer((sock) => this.onClient(sock));
      this.tcp.once('error', reject);
      this.tcp.listen(LAB_MGMT_TCP_PORT, () => {
        this.tcp?.off('error', reject);
        resolve();
      });
    });
  }

  private onClient(sock: TcpSocket): void {
    let buffer = '';
    let registeredId: string | null = null;

    sock.write(
      encodeWireMessage({
        type: 'hub_hello',
        sessionId: this.sessionId,
        hostname: getHostname(),
      }),
    );

    sock.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const msg = parseWireMessage(line);
        if (!msg) continue;

        if (msg.type === 'register') {
          registeredId = msg.machine.machineId;
          const info: RegisteredNode = {
            ...msg.machine,
            labMgmtSessionId: this.sessionId,
            lastSeen: new Date().toISOString(),
          };
          this.nodes.set(registeredId, info);
          this.sockets.set(registeredId, sock);
          this.statusMessage = null;
          this.emitState();
          continue;
        }

        if (msg.type === 'command_response') {
          const pending = this.pending.get(msg.response.requestId);
          if (pending) {
            this.pending.delete(msg.response.requestId);
            pending.resolve(msg.response);
          }
          this.emit('commandResponse', msg.response);
        }
      }
    });

    sock.on('close', () => {
      if (registeredId) {
        this.sockets.delete(registeredId);
        this.nodes.delete(registeredId);
        this.emitState();
      }
    });
  }

  /** Thông tin hub để snapshot sync — không dùng cho advertise. */
  async asHubMachineInfo(): Promise<LabMachineInfo> {
    const hw = await collectMachineHardware();
    return {
      machineId: this.machineId,
      hostname: hw.hostname,
      localIp: hw.localIp,
      role: 'teacher_hub',
      teacherAccountId: this.teacher.accountId,
      teacherEmail: this.teacher.email,
      labMgmtSessionId: this.sessionId,
      appVersion: APP_VERSION,
      os: hw.os,
      lastSeen: new Date().toISOString(),
      cpu: hw.cpu,
      ramGb: hw.ramGb,
      storage: hw.storage,
      gpu: hw.gpu,
      macAddress: hw.macAddress,
    };
  }
}
