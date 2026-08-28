'use client';

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// Registering useGSAP as a plugin is what lets gsap.context() find and
// revert animations created inside a React component on unmount — without
// it, every route change leaks tweens holding references to unmounted DOM.
// Safe at module scope: registerPlugin never touches `window`, so this
// doesn't break server rendering.
gsap.registerPlugin(useGSAP);

/**
 * The media query every animation in this app is gated behind.
 *
 * GSAP's own guidance is to use gsap.matchMedia() for prefers-reduced-
 * motion rather than a hand-rolled window.matchMedia check, because
 * matchMedia reverts everything created inside a handler as soon as the
 * query stops matching. Gating on `no-preference` (rather than branching
 * on `reduce` inside the handler) means that for a user who asked for
 * reduced motion no tween is ever created at all — the element simply
 * renders in its final state, with nothing to revert and nothing that can
 * flash.
 *
 * globals.css handles the CSS half of the same promise (transitions,
 * tailwindcss-animate keyframes, smooth scrolling); a JS tween writing
 * inline styles frame by frame can't be stopped by a CSS media query, so
 * both halves are required.
 *
 * Usage, per gsap-react + gsap-core:
 *
 *   useGSAP(() => {
 *     const mm = gsap.matchMedia();
 *     mm.add(MOTION_OK, () => { ...tweens... }, scope.current);
 *     return () => mm.revert();
 *   }, { scope, dependencies: [x], revertOnUpdate: true });
 *
 * Note `mm.add`'s third argument: it scopes selector text inside the
 * handler. And note that gsap.context() must never be nested inside
 * matchMedia — matchMedia creates one internally.
 */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/**
 * The motion vocabulary, in one place.
 *
 * Everything is at or under 400ms and eases out, never bounces: this is an
 * exam-administration tool, and motion exists here to explain what changed
 * (a page arrived, a value settled, the active section moved), not to
 * entertain. A teacher clicking through a lobby during a live exam must
 * never wait on an animation.
 */
export const MOTION = {
  /** Page/section enter. */
  enter: 0.3,
  /** Per-item delay when a group of cards enters together. */
  stagger: 0.06,
  /** The sliding sidebar rail. */
  indicator: 0.3,
  /** Dashboard number count-up. Longer on purpose — it's the one place
   *  where motion carries information (the magnitude of the number). */
  count: 0.8,
  /** Enter easing. Fast start, soft landing — no overshoot. */
  easeOut: 'power3.out',
  /** Numeric easing: gentler, so the last digits don't crawl. */
  easeCount: 'power2.out',
} as const;

export { gsap, useGSAP };
