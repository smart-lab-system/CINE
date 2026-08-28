export const ASSET_CODE_PATTERN = /^[A-Za-z0-9._-]{2,64}$/;
export const HOSTNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/;

export type BatchRenameTarget = 'assetCode' | 'hostname' | 'both';

export type BatchRenameItem = {
  id: string;
  assetCode?: string;
  hostname?: string;
};

export type SequentialNameOptions = {
  prefix: string;
  startIndex?: number;
  paddingDigits?: number;
};

export function formatPaddedIndex(index: number, paddingDigits: number): string {
  return String(index).padStart(paddingDigits, '0');
}

export function formatSequentialValue(
  prefix: string,
  index: number,
  paddingDigits: number,
): string {
  return `${prefix}${formatPaddedIndex(index, paddingDigits)}`;
}

/** Numeric-aware asset-code order, then a stable id tie-break. */
export function sortWorkstationsByCurrentOrder<
  T extends { id: string; assetCode: string },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const cmp = a.assetCode.localeCompare(b.assetCode, 'en', {
      numeric: true,
      sensitivity: 'base',
    });
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });
}

export function buildBatchRenameItems(
  workstations: readonly { id: string; assetCode: string }[],
  options: SequentialNameOptions & { target: BatchRenameTarget },
): { items: BatchRenameItem[] } | { error: string } {
  const prefix = options.prefix.trim();
  const startIndex = options.startIndex ?? 1;
  const paddingDigits = options.paddingDigits ?? 2;
  const target = options.target;

  if (!Number.isInteger(startIndex) || startIndex < 0) {
    return { error: 'start_index phải là số nguyên ≥ 0.' };
  }
  if (!Number.isInteger(paddingDigits) || paddingDigits < 1 || paddingDigits > 8) {
    return { error: 'padding_digits phải từ 1 đến 8.' };
  }
  if (workstations.length === 0) {
    return { error: 'Phòng chưa có máy trạm để đặt mã.' };
  }

  const ordered = sortWorkstationsByCurrentOrder(workstations);
  const items: BatchRenameItem[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const value = formatSequentialValue(prefix, startIndex + i, paddingDigits);
    const item: BatchRenameItem = { id: ordered[i].id };

    if (target === 'assetCode' || target === 'both') {
      if (!ASSET_CODE_PATTERN.test(value)) {
        return {
          error: `Mã TS không hợp lệ: ${value}. Dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang (2–64 ký tự).`,
        };
      }
      item.assetCode = value;
    }
    if (target === 'hostname' || target === 'both') {
      if (!HOSTNAME_PATTERN.test(value)) {
        return {
          error: `Hostname không hợp lệ: ${value}. Bắt đầu bằng chữ/số, chỉ gồm chữ, số, dấu chấm hoặc gạch ngang.`,
        };
      }
      item.hostname = value;
    }
    items.push(item);
  }

  return { items };
}
