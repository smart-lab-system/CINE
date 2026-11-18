import { describe, expect, it, vi } from 'vitest';
import { scrollIntoContainer } from './scroll-into-container';

describe('scrollIntoContainer', () => {
  it('cuộn container theo vị trí child, không gọi scrollIntoView trên child', () => {
    const scrollTo = vi.fn();
    const container = {
      getBoundingClientRect: () => ({ top: 100, height: 400, bottom: 500, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
      scrollTop: 50,
      scrollTo,
    } as unknown as HTMLElement;
    const child = {
      getBoundingClientRect: () => ({ top: 500, height: 40, bottom: 540, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    scrollIntoContainer(container, child, 'auto');

    // child.top - container.top - (container.h/2 - child.h/2) = 500-100-(200-20) = 220
    // scrollTop mới = 50 + 220 = 270
    expect(scrollTo).toHaveBeenCalledWith({ top: 270, behavior: 'auto' });
    expect(child.scrollIntoView).not.toHaveBeenCalled();
  });
});
