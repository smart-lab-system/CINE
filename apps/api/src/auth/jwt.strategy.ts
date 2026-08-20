import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserEntity } from '../identity/entities/user.entity';
import { AccessTokenPayload } from './types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
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
    // Re-read the account on every request so locking or soft-deleting it
    // takes effect immediately instead of after the access token's TTL
    // elapses — one indexed primary-key lookup, and the only thing that
    // actually makes revocation meaningful for stateless JWTs.
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.deletedAt || user.status !== 'active') {
      throw new UnauthorizedException();
    }

    return payload;
  }
}
