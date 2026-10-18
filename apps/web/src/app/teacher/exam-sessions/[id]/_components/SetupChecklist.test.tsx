import { describe, expect, it } from 'vitest';
import { evaluateSetupChecklist } from './SetupChecklist';

describe('evaluateSetupChecklist', () => {
  const future = {
    startTime: new Date(Date.now() + 60_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
  };

  it('chặn khi không còn scheduled', () => {
    const r = evaluateSetupChecklist({
      status: 'active',
      ...future,
      studentCount: 10,
      materialCount: 1,
      hasRubric: true,
      deliverableCount: 1,
    });
    expect(r.canOpen).toBe(false);
    expect(r.blockReason).toMatch(/Sắp diễn ra/);
  });

  it('chặn khi endTime đã qua', () => {
    const r = evaluateSetupChecklist({
      status: 'scheduled',
      startTime: new Date(Date.now() - 3_600_000).toISOString(),
      endTime: new Date(Date.now() - 60_000).toISOString(),
      studentCount: 10,
      materialCount: 1,
      hasRubric: true,
      deliverableCount: 1,
    });
    expect(r.canOpen).toBe(false);
    expect(r.blockReason).toMatch(/đã qua/);
  });

  it('chặn khi chưa cấu hình thư mục bài thi', () => {
    const r = evaluateSetupChecklist({
      status: 'scheduled',
      ...future,
      studentCount: 10,
      materialCount: 1,
      hasRubric: true,
      deliverableCount: 0,
    });
    expect(r.canOpen).toBe(false);
    expect(r.blockReason).toMatch(/thư mục bài thi/);
  });

  it('cho mở khi scheduled + giờ hợp lệ + có file; thiếu đề/rubric chỉ cảnh báo', () => {
    const r = evaluateSetupChecklist({
      status: 'scheduled',
      ...future,
      studentCount: 0,
      materialCount: 0,
      hasRubric: false,
      deliverableCount: 1,
    });
    expect(r.canOpen).toBe(true);
    expect(r.blockReason).toBeNull();
    expect(r.warnings.length).toBe(3);
  });
});
