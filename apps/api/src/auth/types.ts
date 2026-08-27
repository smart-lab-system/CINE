import { AccountRole } from '../identity/entities/account.entity';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AccountRole;
}

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
}

// JwtStrategy.validate() (see jwt.strategy.ts) returns AccessTokenPayload,
// which Passport assigns straight onto `request.user` for any route behind
// JwtAuthGuard. @types/passport (a transitive dependency) already declares
// `Express.Request.user?: Express.User` with an empty `User` interface —
// merging fields into that interface (rather than redeclaring
// `Request.user`, which TS rejects as an incompatible duplicate) is how
// consumers are meant to extend it. Without this, every controller reading
// `req.user` would need its own unsafe cast (RolesGuard sidesteps this by
// reading off an untyped `getRequest()`, which isn't available to a typed
// `@Req() req: Request`).
// `declare global { namespace Express {...} } ` is the only way TS
// supports augmenting an existing ambient global namespace like this — not
// a case eslint's blanket `no-namespace`/`no-empty-object-type` rules are
// meant to catch (same class of framework-types exception eslint.config.mjs
// already carves out below).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      sub: string;
      email: string;
      role: AccountRole;
    }
  }
}
