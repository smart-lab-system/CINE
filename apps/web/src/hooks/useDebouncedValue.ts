'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value`, but only after it's stopped changing for `delayMs` —
 * for search inputs that shouldn't fire a server request on every
 * keystroke. Generic so it works for any input type, not just strings.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
