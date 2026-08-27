// Decodes (never verifies) the `role` claim out of the access-token JWT's
// payload segment, for `middleware.ts` only. This is deliberately NOT
// signature verification — it exists purely to pick which dashboard/route
// group to redirect to, a UX convenience. The backend's `JwtAuthGuard` (on
// every real API call) is what actually verifies the token and enforces
// `@Roles(...)` — see the design spec's "Route protection" section. A
// forged/tampered token here can, at worst, make the wrong empty shell
// render client-side; it can never grant access to real data.
//
// Written against Web APIs only (atob, TextDecoder) so it runs in the Edge
// middleware runtime, which doesn't have Node's Buffer.
export function decodeAccessTokenRole(token: string): string | null {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);

    const payload: unknown = JSON.parse(json);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      typeof (payload as { role: unknown }).role === 'string'
    ) {
      return (payload as { role: string }).role;
    }
    return null;
  } catch {
    return null;
  }
}
