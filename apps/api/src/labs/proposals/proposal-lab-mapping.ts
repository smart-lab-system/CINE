import type { LabRoomProposalDeviceRecord } from '../entities/lab-room-proposal.entity';

const LAB_CODE_RE = /^[A-Za-z0-9._-]{2,32}$/;
const ASSET_CODE_RE = /^[A-Za-z0-9._-]{2,64}$/;
const HOSTNAME_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export function normalizeProposalLabCode(roomCode: string): string {
  let code = roomCode
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (code.length < 2) {
    const suffix = roomCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    code = `${code || 'LAB'}${suffix || '01'}`.slice(0, 32);
  }

  if (!LAB_CODE_RE.test(code)) {
    code = `LAB-${Date.now().toString(36)}`.slice(0, 32);
  }

  return code;
}

function sanitizeToken(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function normalizeWorkstationHostname(
  hostname: string,
  machineId: string,
  index: number,
): string {
  const candidates = [
    hostname.trim(),
    machineId.trim(),
    `pc-${index + 1}`,
  ];

  for (const candidate of candidates) {
    const token = sanitizeToken(candidate, `pc-${index + 1}`);
    const value = /^[A-Za-z0-9]/.test(token) ? token : `pc-${token}`;
    if (HOSTNAME_RE.test(value.slice(0, 63))) {
      return value.slice(0, 63);
    }
  }

  return `pc-${index + 1}`;
}

export function normalizeWorkstationAssetCode(
  labCode: string,
  hostname: string,
  index: number,
): string {
  const suffix = sanitizeToken(hostname, `ws-${index + 1}`).slice(0, 40);
  const raw = `${labCode}-${suffix}`.slice(0, 64);
  if (ASSET_CODE_RE.test(raw)) {
    return raw;
  }
  return `WS-${labCode}-${String(index + 1).padStart(2, '0')}`.slice(0, 64);
}

export function normalizeMacAddress(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !MAC_RE.test(trimmed)) {
    return null;
  }
  return trimmed.toUpperCase().replace(/-/g, ':');
}

export function formatOperatingSystem(
  osEdition: string,
  osVersion: string,
): string | null {
  const label = [osEdition, osVersion]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  if (!label) {
    return null;
  }
  return label.slice(0, 120);
}

export function mapProposalDeviceToWorkstation(
  labCode: string,
  device: LabRoomProposalDeviceRecord,
  index: number,
  usedMacs: Set<string>,
): {
  assetCode: string;
  hostname: string;
  macAddress: string | null;
  staticIpAddress: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  type: 'master' | 'client';
  notes: string | null;
} {
  const hostname = normalizeWorkstationHostname(
    device.hostname,
    device.machineId,
    index,
  );
  const mac = normalizeMacAddress(device.macAddress);
  const macAddress = mac && !usedMacs.has(mac) ? mac : null;
  if (macAddress) {
    usedMacs.add(macAddress);
  }

  const ipv4 = device.ipv4?.trim();
  const staticIpAddress =
    ipv4 && /^(\d{1,3}\.){3}\d{1,3}$/.test(ipv4) ? ipv4 : null;

  return {
    assetCode: normalizeWorkstationAssetCode(labCode, hostname, index),
    hostname,
    macAddress,
    staticIpAddress,
    serialNumber: device.serial?.trim()?.slice(0, 100) || null,
    operatingSystem: formatOperatingSystem(device.osEdition, device.osVersion),
    type: device.role === 'tutor' ? 'master' : 'client',
    notes: `Tutor machineId: ${device.machineId}`,
  };
}
