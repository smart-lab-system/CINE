import { describe, expect, it } from 'vitest';
import { getPrimaryMacAddress, collectMachineHardware } from './machine-hardware';

describe('machine-hardware', () => {
  it('returns a MAC string (may be empty on exotic hosts)', () => {
    const mac = getPrimaryMacAddress();
    expect(typeof mac).toBe('string');
  });

  it('collects at least hostname, cpu, ram, os, ip', async () => {
    const hw = await collectMachineHardware({ force: true });
    expect(hw.hostname.length).toBeGreaterThan(0);
    expect(hw.cpu.length).toBeGreaterThan(0);
    expect(hw.ramGb).toBeGreaterThan(0);
    expect(hw.os.length).toBeGreaterThan(0);
    expect(hw.localIp.length).toBeGreaterThan(0);
    expect(hw.storage.length).toBeGreaterThan(0);
    expect(hw.macAddress.length).toBeGreaterThan(0);
  }, 30_000);
});
