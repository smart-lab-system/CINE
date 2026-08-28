import { describe, expect, it } from 'vitest';
import { assignedWorkstationHostname } from './seating-types';

describe('assignedWorkstationHostname', () => {
  it('returns the hostname only when a workstation is assigned', () => {
    expect(assignedWorkstationHostname(null, 'lab-pc-01')).toBeNull();
    expect(assignedWorkstationHostname('ws-1', '  lab-pc-01  ')).toBe(
      'lab-pc-01',
    );
    expect(assignedWorkstationHostname('ws-1', '')).toBeNull();
    expect(assignedWorkstationHostname('ws-1', '   ')).toBeNull();
    expect(assignedWorkstationHostname('ws-1', undefined)).toBeNull();
  });
});
