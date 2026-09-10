/**
 * Finding the scroll containers above an element, for tests.
 *
 * jsdom computes no layout, so "does this actually scroll" and "does this
 * header actually stick" are both out of reach. What IS reachable — and is
 * what the lobby's two-column layout genuinely turns on — is how many
 * scroll containers sit above a given element, and which one is nearest.
 *
 * That matters because a `sticky` element resolves its offsets against the
 * nearest ancestor scrollport, not against whichever box the author had in
 * mind. Introduce one extra scrolling wrapper anywhere in between and the
 * sticky header silently stops sticking, with nothing else visibly wrong.
 * See `components/ui/table.tsx` for the CSS rule behind it.
 */

/**
 * Matches any Tailwind class that makes a box a scroll container — every
 * axis, both keywords, and the arbitrary-property form.
 *
 * Deliberately broader than the classes actually in use: a future
 * `overflow-auto` or `[overflow:scroll]` wrapper is the same regression as
 * an `overflow-y-auto` one, and a matcher that only knew today's spelling
 * would stay green through it.
 */
const SCROLLPORT_CLASS = /\boverflow(-[xy])?-(auto|scroll)\b|\[overflow(-[xy])?:\s*(auto|scroll)\]/;

/** Every scroll container above `el`, nearest first. */
export function scrollportsAbove(el: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (SCROLLPORT_CLASS.test(node.className)) {
      found.push(node);
    }
  }
  return found;
}

/**
 * The scroll container a `sticky` descendant of `el` would resolve
 * against, or null if nothing above it scrolls.
 */
export function nearestScrollport(el: Element): HTMLElement | null {
  return scrollportsAbove(el)[0] ?? null;
}
