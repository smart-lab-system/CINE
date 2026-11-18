/**
 * Cuộn `child` vào giữa `container` (overflow), không kéo cả trang như
 * `scrollIntoView` mặc định khi có nhiều khung cuộn lồng nhau.
 */
export function scrollIntoContainer(
  container: HTMLElement,
  child: HTMLElement,
  behavior: ScrollBehavior = 'smooth',
): void {
  const cRect = container.getBoundingClientRect();
  const tRect = child.getBoundingClientRect();
  const delta = tRect.top - cRect.top - (cRect.height / 2 - tRect.height / 2);
  const top = container.scrollTop + delta;
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top, behavior });
  } else {
    container.scrollTop = top;
  }
}

export function reducedMotionScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
