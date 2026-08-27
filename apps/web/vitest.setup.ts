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
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
