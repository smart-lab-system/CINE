import { execFile } from 'node:child_process';
import { cpus, networkInterfaces, totalmem } from 'node:os';
import { promisify } from 'node:util';
import { getHostname, getLocalIp, getOsLabel } from './machine-identity';

const execFileAsync = promisify(execFile);

/** Phần cứng máy — map sang field đề xuất phòng / `computer`. */
export interface MachineHardwareInfo {
  hostname: string;
  localIp: string;
  os: string;
  cpu: string;
  ramGb: number;
  storage: string;
  gpu: string | null;
  macAddress: string;
}

let cached: Promise<MachineHardwareInfo> | null = null;

/** Lấy MAC của NIC IPv4 không loopback đầu tiên. */
export function getPrimaryMacAddress(): string {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        return entry.mac.toUpperCase();
      }
    }
  }
  return '';
}

function formatRamGb(): number {
  return Math.max(1, Math.round(totalmem() / 1024 ** 3));
}

function cpuFromNode(): string {
  return cpus()[0]?.model?.trim() || '';
}

interface WinExtras {
  cpu?: string;
  ramGb?: number;
  storage?: string;
  gpu?: string | null;
  os?: string;
  macAddress?: string;
}

async function collectWindowsExtras(): Promise<WinExtras> {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name",
    "$ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)",
    "$disks = @(Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | ForEach-Object {",
    "  $gb = [math]::Round($_.Size / 1GB); if ($gb -gt 0) { \"$($_.DeviceID) ${gb}GB\" }",
    '})',
    "$storage = ($disks -join ', ')",
    "if (-not $storage) {",
    "  $drives = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {",
    "    $gb = [math]::Round($_.Size / 1GB); if ($gb -gt 0) { \"$($_.Model) ${gb}GB\" }",
    '  })',
    "  $storage = ($drives -join ', ')",
    '}',
    "$gpu = (Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Basic|Remote|Microsoft' } | Select-Object -First 1).Name",
    "$os = (Get-CimInstance Win32_OperatingSystem).Caption",
    "$mac = (Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.MACAddress } | Select-Object -First 1).MACAddress",
    "Write-Output (@{ cpu = $cpu; ramGb = $ram; storage = $storage; gpu = $gpu; os = $os; macAddress = $mac } | ConvertTo-Json -Compress)",
  ].join('; ');

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 20_000, windowsHide: true, encoding: 'utf8' },
    );
    const parsed = JSON.parse(stdout.trim()) as {
      cpu?: string;
      ramGb?: number;
      storage?: string;
      gpu?: string | null;
      os?: string;
      macAddress?: string;
    };
    return {
      cpu: parsed.cpu?.trim() || undefined,
      ramGb: typeof parsed.ramGb === 'number' && parsed.ramGb > 0 ? Math.round(parsed.ramGb) : undefined,
      storage: parsed.storage?.trim() || undefined,
      gpu: parsed.gpu?.trim() || null,
      os: parsed.os?.trim() || undefined,
      macAddress: parsed.macAddress?.replace(/-/g, ':').toUpperCase() || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Thu thập phần cứng máy hiện tại.
 * Windows: PowerShell/CIM bổ sung storage + GPU (+ CPU/OS/MAC nếu có).
 * Fallback Node: CPU model, RAM, MAC, hostname, IP, OS label.
 */
export async function collectMachineHardware(options?: {
  force?: boolean;
}): Promise<MachineHardwareInfo> {
  if (!options?.force && cached) {
    return cached;
  }
  cached = (async () => {
    const base: MachineHardwareInfo = {
      hostname: getHostname(),
      localIp: getLocalIp(),
      os: getOsLabel(),
      cpu: cpuFromNode(),
      ramGb: formatRamGb(),
      storage: '',
      gpu: null,
      macAddress: getPrimaryMacAddress(),
    };

    if (process.platform === 'win32') {
      const win = await collectWindowsExtras();
      if (win.cpu) base.cpu = win.cpu;
      if (win.ramGb) base.ramGb = win.ramGb;
      if (win.storage) base.storage = win.storage;
      if (win.gpu !== undefined) base.gpu = win.gpu;
      if (win.os) base.os = win.os;
      if (win.macAddress) base.macAddress = win.macAddress;
    }

    if (!base.storage) {
      base.storage = 'Không xác định';
    }
    if (!base.cpu) {
      base.cpu = 'Không xác định';
    }
    if (!base.macAddress) {
      base.macAddress = '00:00:00:00:00:00';
    }

    return base;
  })();

  try {
    return await cached;
  } catch (err) {
    cached = null;
    throw err;
  }
}

/** Xóa cache — dùng trước khi đề xuất để lấy số liệu mới. */
export function clearMachineHardwareCache(): void {
  cached = null;
}
