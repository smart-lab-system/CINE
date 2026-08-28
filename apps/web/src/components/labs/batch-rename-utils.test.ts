import { describe, expect, it } from 'vitest';
import {
  buildBatchRenameItems,
  formatSequentialValue,
  sortWorkstationsByCurrentOrder,
} from './batch-rename-utils';

describe('batch-rename-utils', () => {
  it('pads sequential values from a prefix', () => {
    expect(formatSequentialValue('FIT.H1.', 1, 2)).toBe('FIT.H1.01');
    expect(formatSequentialValue('FIT.H1.', 12, 2)).toBe('FIT.H1.12');
    expect(formatSequentialValue('PC-', 5, 3)).toBe('PC-005');
  });

  it('sorts workstations by current asset-code order with numeric awareness', () => {
    const sorted = sortWorkstationsByCurrentOrder([
      { id: 'c', assetCode: 'PC-10' },
      { id: 'a', assetCode: 'PC-2' },
      { id: 'b', assetCode: 'PC-1' },
    ]);
    expect(sorted.map((w) => w.assetCode)).toEqual(['PC-1', 'PC-2', 'PC-10']);
  });

  it('assigns FIT.H1.01, FIT.H1.02, FIT.H1.03 across both fields', () => {
    const result = buildBatchRenameItems(
      [
        { id: 'w2', assetCode: 'OLD-2' },
        { id: 'w1', assetCode: 'OLD-1' },
        { id: 'w3', assetCode: 'OLD-3' },
      ],
      {
        prefix: 'FIT.H1.',
        startIndex: 1,
        paddingDigits: 2,
        target: 'both',
      },
    );

    expect(result).toEqual({
      items: [
        { id: 'w1', assetCode: 'FIT.H1.01', hostname: 'FIT.H1.01' },
        { id: 'w2', assetCode: 'FIT.H1.02', hostname: 'FIT.H1.02' },
        { id: 'w3', assetCode: 'FIT.H1.03', hostname: 'FIT.H1.03' },
      ],
    });
  });

  it('can target only asset tag or only hostname', () => {
    const workstations = [
      { id: 'w1', assetCode: 'A' },
      { id: 'w2', assetCode: 'B' },
    ];

    expect(
      buildBatchRenameItems(workstations, {
        prefix: 'LAB.',
        target: 'assetCode',
      }),
    ).toEqual({
      items: [
        { id: 'w1', assetCode: 'LAB.01' },
        { id: 'w2', assetCode: 'LAB.02' },
      ],
    });

    expect(
      buildBatchRenameItems(workstations, {
        prefix: 'host-',
        startIndex: 3,
        paddingDigits: 2,
        target: 'hostname',
      }),
    ).toEqual({
      items: [
        { id: 'w1', hostname: 'host-03' },
        { id: 'w2', hostname: 'host-04' },
      ],
    });
  });

  it('rejects generated hostnames that violate the hostname pattern', () => {
    const result = buildBatchRenameItems([{ id: 'w1', assetCode: 'A' }], {
      prefix: 'FIT_H1_',
      target: 'hostname',
    });
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/hostname không hợp lệ/i),
      }),
    );
  });
});
