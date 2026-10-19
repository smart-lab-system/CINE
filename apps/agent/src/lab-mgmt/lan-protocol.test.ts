import { describe, expect, it } from 'vitest';
import { encodeWireMessage, parseWireMessage } from './lan-protocol';

describe('lan-protocol', () => {
  it('round-trips a register message', () => {
    const raw = encodeWireMessage({
      type: 'register',
      machine: {
        machineId: 'm1',
        hostname: 'PC-01',
        localIp: '10.0.0.2',
        role: 'student_node',
        studentMssv: 'SV001',
        labMgmtSessionId: 's1',
        appVersion: '0.1.0',
        os: 'win32',
        lastSeen: '2026-10-18T00:00:00.000Z',
      },
    });
    expect(raw.endsWith('\n')).toBe(true);
    const parsed = parseWireMessage(raw.trim());
    expect(parsed?.type).toBe('register');
    if (parsed?.type === 'register') {
      expect(parsed.machine.studentMssv).toBe('SV001');
    }
  });

  it('returns null for garbage', () => {
    expect(parseWireMessage('not-json')).toBeNull();
  });
});
