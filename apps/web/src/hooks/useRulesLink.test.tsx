import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRulesLink } from './useRulesLink';

const h = vi.hoisted(() => ({ rubrics: { data: undefined as undefined | { id: string; name: string }[] } }));
vi.mock('./useGrading', () => ({ useRubrics: () => h.rubrics }));

describe('useRulesLink', () => {
  it('biết rubric của phiên thì liên kết mở đúng rubric đó', () => {
    h.rubrics = { data: [{ id: 'ru-1', name: 'Giữa kỳ CTDL' }] };
    expect(renderHook(() => useRulesLink('ru-1')).result.current).toBe('/teacher/rules?rubric=Gi%E1%BB%AFa%20k%E1%BB%B3%20CTDL');
  });
  it('phiên chưa gắn rubric, rubric chưa tải, hoặc không tìm thấy thì về trang gốc', () => {
    h.rubrics = { data: [{ id: 'ru-1', name: 'A' }] };
    expect(renderHook(() => useRulesLink(null)).result.current).toBe('/teacher/rules');
    expect(renderHook(() => useRulesLink('ru-khac')).result.current).toBe('/teacher/rules');
    h.rubrics = { data: undefined };
    expect(renderHook(() => useRulesLink('ru-1')).result.current).toBe('/teacher/rules');
  });
});
