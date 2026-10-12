import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RulerOriginNote } from './RulerOriginNote';

const h = vi.hoisted(() => ({
  detail: { data: undefined as unknown },
  bundles: { data: undefined as unknown },
}));
vi.mock('@/hooks/useExamSession', () => ({ useExamSessionDetail: () => h.detail }));
vi.mock('@/hooks/useTestBundle', () => ({ useTestBundles: () => h.bundles }));

const bundle = (over: Record<string, unknown> = {}) => ({
  id: 'b1', version: 1, approvedAt: '2026-09-29T01:05:00.000Z', origin: 'generated', caseCount: 3, ...over,
});

beforeEach(() => {
  h.detail = { data: { testBundleId: 'b1' } };
  h.bundles = { data: [bundle()] };
});

describe('RulerOriginNote (UI spec T-UI-17)', () => {
  it('says the ruler was made by the system, and when the teacher approved it', () => {
    render(<RulerOriginNote sessionId="s1" />);
    expect(screen.getByText(
      `Thước do hệ thống sinh — bạn duyệt lúc ${new Date('2026-09-29T01:05:00.000Z').toLocaleString('vi-VN')}.`,
    )).toBeInTheDocument();
  });

  it('also covers a bundle built from the system model answer', () => {
    h.bundles = { data: [bundle({ origin: 'from_model_answer' })] };
    render(<RulerOriginNote sessionId="s1" />);
    expect(screen.getByText(/Thước do hệ thống sinh/)).toBeInTheDocument();
  });

  it('says nothing when the teacher wrote the bundle', () => {
    h.bundles = { data: [bundle({ origin: 'teacher' })] };
    const { container } = render(<RulerOriginNote sessionId="s1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing when there is no pinned bundle', () => {
    h.detail = { data: { testBundleId: null } };
    const { container } = render(<RulerOriginNote sessionId="s1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing while data is loading, and when the API gives no origin — never a guess', () => {
    h.detail = { data: undefined };
    expect(render(<RulerOriginNote sessionId="s1" />).container).toBeEmptyDOMElement();

    h.detail = { data: { testBundleId: 'b1' } };
    h.bundles = { data: [bundle({ origin: undefined })] };
    expect(render(<RulerOriginNote sessionId="s1" />).container).toBeEmptyDOMElement();
  });
});
