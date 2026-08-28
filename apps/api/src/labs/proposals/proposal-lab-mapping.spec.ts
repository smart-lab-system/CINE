import {
  mapProposalDeviceToWorkstation,
  normalizeProposalLabCode,
  normalizeWorkstationHostname,
} from './proposal-lab-mapping';

describe('proposal-lab-mapping', () => {
  it('normalizes room codes for lab master data', () => {
    expect(normalizeProposalLabCode('H1.1')).toBe('H1.1');
    expect(normalizeProposalLabCode('H 1.1')).toBe('H1.1');
    expect(normalizeProposalLabCode('A')).toMatch(/^[A-Za-z0-9._-]{2,32}$/);
  });

  it('maps proposal devices to workstation rows', () => {
    const usedMacs = new Set<string>();
    const row = mapProposalDeviceToWorkstation(
      'H1.1',
      {
        role: 'tutor',
        machineId: '550e8400-e29b-41d4-a716-446655440000',
        hostname: 'DESKTOP-ABC',
        macAddress: '00:11:22:33:44:55',
        osEdition: 'Windows 11 Pro',
        osVersion: '10.0.26200',
        serial: '550e8400-e29b-41d4-a716-446655440000',
        ipv4: '192.168.1.10',
      },
      0,
      usedMacs,
    );

    expect(row.type).toBe('master');
    expect(row.hostname).toBe('DESKTOP-ABC');
    expect(row.assetCode.startsWith('H1.1-')).toBe(true);
    expect(row.macAddress).toBe('00:11:22:33:44:55');
    expect(row.staticIpAddress).toBe('192.168.1.10');
  });

  it('falls back when hostname is empty', () => {
    expect(
      normalizeWorkstationHostname('', '550e8400-e29b-41d4-a716-446655440000', 0),
    ).toMatch(/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/);
  });
});
