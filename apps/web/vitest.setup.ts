// jsdom is missing a handful of browser APIs that Radix UI's interactive
// primitives (Select, Dialog, DropdownMenu — used by the shadcn components
// added in the frontend rebuild) call unconditionally: pointer capture,
// scrollIntoView, and ResizeObserver. Without these stubs, any test that
// opens one of those components throws "... is not a function" before it
// gets anywhere near an assertion. None of this changes real browser
// behavior — jsdom just doesn't implement these APIs at all.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
// jsdom 25 still ships no window.matchMedia at all, and GSAP calls it
// unconditionally from gsap.matchMedia() — which every animation in this
// app is gated behind (see src/lib/gsap.ts), so without this any test
// rendering an animated component throws "_win.matchMedia is not a
// function" during the layout effect.
//
// `matches: false` for every query on purpose: that makes
// `(prefers-reduced-motion: no-preference)` fail to match, so no tween is
// ever created under test. Components are built to render their final
// state without animation anyway (gsap.from(), never a CSS opacity: 0
// default), so this keeps assertions deterministic instead of racing a
// 300ms fade.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      media: query,
      matches: false,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
