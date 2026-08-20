import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './middleware';

describe('isProtectedPath', () => {
  it('protects dashboard routes', () => {
    expect(isProtectedPath('/accounts')).toBe(true);
    expect(isProtectedPath('/accounts/123')).toBe(true);
  });

  it('does not protect the login route', () => {
    expect(isProtectedPath('/login')).toBe(false);
  });
});
