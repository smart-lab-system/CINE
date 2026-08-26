import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountEntity } from '../identity/entities/account.entity';
import { AccessTokenPayload } from './types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.ACCESS_TOKEN_SECRET,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AccessTokenPayload> {
    // A valid signature only proves the token was ours when it was issued.
    // Re-read the account on every request so a deletion (or role change)
    // takes effect immediately instead of after the access token's TTL
    // elapses — one indexed primary-key lookup, and the only thing that
    // actually makes revocation meaningful for stateless JWTs. There's no
    // status/soft-delete column any more — accounts are hard-deleted, so
    // "row not found" is the only revoked state.
    const account = await this.accounts.findOne({ where: { id: payload.sub } });
    if (!account) {
      throw new UnauthorizedException();
    }

    // Re-issue the payload from the current row rather than trusting the
    // token's claims — if an admin changed this account's role, requests
    // made with the old token should honor the new role immediately.
    return { sub: account.id, email: account.email, role: account.role };
  }
}
