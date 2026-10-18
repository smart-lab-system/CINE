import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { connect, type Socket as TcpSocket } from 'node:net';
import { EventEmitter } from 'node:events';
import {
  encodeWireMessage,
  LAB_MGMT_ADVERTISE_MAGIC,
  LAB_MGMT_TCP_PORT,
  LAB_MGMT_UDP_PORT,
  parseWireMessage,
  type HubAdvertisePayload,
  type LabCommandRequest,
  type LabCommandResponse,
  type LabMachineInfo,
} from './lan-protocol';
import { collectMachineHardware } from './machine-hardware';
import { APP_VERSION, getHostname, getLocalIp, getOsLabel } from './machine-identity';
import { scanVscodeExtensions } from './vscode-extensions-scan';

export interface StudentNodeState {
  mssv: string;
  fullName: string;
  machineId: string;
  hostname: string;
  localIp: string;
  connected: boolean;
  hubHostname: string | null;
  hubSessionId: string | null;
  statusMessage: string | null;
  lastError: string | null;
}

export class StudentNode extends EventEmitter {
  private udp: UdpSocket | null = null;
  private tcp: TcpSocket | null = null;
  private hubHostname: string | null = null;
  private hubSessionId: string | null = null;
  private statusMessage: string | null = 'Đang tìm máy giảng viên trên LAN…';
  private lastError: string | null = null;
  private connecting = false;
  private stopped = false;

  constructor(
    private readonly machineId: string,
    private readonly mssv: string,
    private readonly fullName: string,
  ) {
    super();
  }

  getState(): StudentNodeState {
    return {
      mssv: this.mssv,
      fullName: this.fullName,
      machineId: this.machineId,
      hostname: getHostname(),
      localIp: getLocalIp(),
      connected: this.tcp !== null && !this.tcp.destroyed,
      hubHostname: this.hubHostname,
      hubSessionId: this.hubSessionId,
      statusMessage: this.statusMessage,
      lastError: this.lastError,
    };
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }

  start(): void {
    this.udp = createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.on('message', (msg, rinfo) => {
      this.handleAdvertiseFrom(msg, rinfo.address);
    });
    this.udp.bind(LAB_MGMT_UDP_PORT, () => {
      this.emitState();
    });
  }

  stop(): void {
    this.stopped = true;
    this.udp?.close();
    this.udp = null;
    this.tcp?.destroy();
    this.tcp = null;
  }

  /** Public cho test — nhận quảng bá Hub. */
  handleAdvertiseFrom(buf: Buffer, remoteAddress: string): void {
    if (this.stopped || this.connecting || (this.tcp && !this.tcp.destroyed)) {
      return;
    }
    let payload: HubAdvertisePayload;
    try {
      payload = JSON.parse(buf.toString('utf8')) as HubAdvertisePayload;
    } catch {
      return;
    }
    if (payload.magic !== LAB_MGMT_ADVERTISE_MAGIC) {
      return;
    }
    this.connectToHub(remoteAddress, payload.tcpPort || LAB_MGMT_TCP_PORT, payload);
  }

  private connectToHub(host: string, port: number, advertise: HubAdvertisePayload): void {
    this.connecting = true;
    this.statusMessage = `Đang kết nối tới Hub ${advertise.hostname} (${host})…`;
    this.emitState();

    const sock = connect({ host, port }, () => {
      this.tcp = sock;
      this.hubHostname = advertise.hostname;
      this.hubSessionId = advertise.sessionId;
      this.statusMessage = `Đã gắn với Hub ${advertise.hostname}.`;
      this.lastError = null;
      this.connecting = false;
      this.emitState();

      void collectMachineHardware().then((hw) => {
        if (sock.destroyed) return;
        const machine: LabMachineInfo = {
          machineId: this.machineId,
          hostname: hw.hostname,
          localIp: hw.localIp,
          role: 'student_node',
          studentMssv: this.mssv,
          studentFullName: this.fullName,
          labMgmtSessionId: advertise.sessionId,
          appVersion: APP_VERSION,
          os: hw.os,
          lastSeen: new Date().toISOString(),
          cpu: hw.cpu,
          ramGb: hw.ramGb,
          storage: hw.storage,
          gpu: hw.gpu,
          macAddress: hw.macAddress,
        };
        sock.write(encodeWireMessage({ type: 'register', machine }));
      });
    });

    let buffer = '';
    sock.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const msg = parseWireMessage(line);
        if (!msg) continue;
        if (msg.type === 'hub_reject') {
          this.lastError = msg.message;
          this.statusMessage = null;
          this.emitState();
          sock.destroy();
          return;
        }
        if (msg.type === 'command') {
          void this.handleCommand(sock, msg.request);
        }
      }
    });

    sock.on('error', (err) => {
      this.lastError = err.message;
      this.connecting = false;
      this.tcp = null;
      this.emitState();
    });

    sock.on('close', () => {
      this.tcp = null;
      this.connecting = false;
      if (!this.stopped) {
        this.statusMessage = 'Mất kết nối Hub — đang chờ quảng bá lại…';
        this.emitState();
      }
    });
  }

  private async handleCommand(sock: TcpSocket, request: LabCommandRequest): Promise<void> {
    const base = {
      requestId: request.requestId,
      machineId: this.machineId,
      mssv: this.mssv,
    };

    let response: LabCommandResponse;
    try {
      if (request.command === 'PING') {
        response = { ...base, ok: true, payload: { pongAt: new Date().toISOString() } };
      } else if (request.command === 'GET_MACHINE_INFO') {
        const hw = await collectMachineHardware({ force: true });
        response = {
          ...base,
          ok: true,
          payload: {
            machineId: this.machineId,
            hostname: hw.hostname,
            localIp: hw.localIp,
            os: hw.os,
            mssv: this.mssv,
            cpu: hw.cpu,
            ramGb: hw.ramGb,
            storage: hw.storage,
            gpu: hw.gpu,
            macAddress: hw.macAddress,
          },
        };
      } else if (request.command === 'SCAN_VSCODE_EXTENSIONS') {
        const scan = scanVscodeExtensions();
        response = scan.ok
          ? {
              ...base,
              ok: true,
              payload: { extensions: scan.extensions, vscodeVersion: scan.vscodeVersion },
            }
          : { ...base, ok: false, error: scan.error };
      } else {
        response = { ...base, ok: false, error: `Lệnh không hỗ trợ: ${String(request.command)}` };
      }
    } catch (err) {
      response = {
        ...base,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    sock.write(encodeWireMessage({ type: 'command_response', response }));
  }
}
