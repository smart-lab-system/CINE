import { describe, expect, it } from 'vitest';
import {
  ACTIONS_NOT_TRIGGERED_ON_REGISTER,
  aggregateRoom,
  compareAllowlist,
} from './hub-actions';

describe('hub-actions', () => {
  it('lists business actions that must not run on register', () => {
    expect(ACTIONS_NOT_TRIGGERED_ON_REGISTER).toContain('scan_extensions');
    expect(ACTIONS_NOT_TRIGGERED_ON_REGISTER).toContain('sync_backend');
    expect(ACTIONS_NOT_TRIGGERED_ON_REGISTER).not.toContain('refresh_machines');
  });

  it('compareAllowlist requires prior scan', () => {
    const result = compareAllowlist(
      [
        {
          machineId: 'm1',
          hostname: 'PC',
          localIp: '10.0.0.1',
          role: 'student_node',
          studentMssv: 'SV1',
          labMgmtSessionId: 's',
          appVersion: '0.1.0',
          os: 'win32',
          lastSeen: '',
        },
      ],
      [],
    );
    expect(result[0].error).toMatch(/Chưa quét/);
  });

  it('aggregateRoom collects blocked ids', () => {
    const agg = aggregateRoom([
      {
        machineId: 'm1',
        studentMssv: 'SV1',
        hostname: 'A',
        rows: [
          {
            extensionId: 'evil.x',
            version: '1',
            verdict: 'blocked',
            matchedScope: null,
          },
        ],
        extensionCount: 1,
        violationCount: 1,
        status: 'has_violations',
      },
    ]);
    expect(agg.machinesWithViolations).toBe(1);
    expect(agg.blockedExtensionIds).toEqual(['evil.x']);
  });
});
