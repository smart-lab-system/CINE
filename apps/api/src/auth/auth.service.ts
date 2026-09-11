import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AccountEntity } from '../identity/entities/account.entity';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload, PublicAccount } from './types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    account: PublicAccount;
  }> {
    const account = await this.accounts.findOne({ where: { email: dto.email } });
    if (!account) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(account.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Sau khi verify mật khẩu, không phải trước: kiểm trước thì endpoint
    // này trả lời khác nhau cho "email này tồn tại nhưng bị khoá" và
    // "email này không tồn tại" — một oracle liệt kê tài khoản.
    if (!account.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá.');
    }

    return this.issueSession(account);
  }

  /**
   * Exchanges a still-valid refresh token for a fresh token pair. The
   * refresh token rotates on every call, so a leaked one stops being usable
   * as soon as the legitimate holder refreshes.
   */
  async refresh(refreshToken: string | undefined): Promise<{
    accessToken: string;
    refreshToken: string;
    account: PublicAccount;
  }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(refreshToken, {
        secret: process.env.REFRESH_TOKEN_SECRET,
      });
    } catch {
      // Expired, tampered with, or signed with the access-token secret.
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Re-check the account against the DB rather than trusting the token's
    // claims: it was minted up to REFRESH_TOKEN_TTL ago, and the account may
    // have been deleted, deactivated, or had its role changed since.
    //
    // `is_active` phải được kiểm Ở ĐÂY chứ không chỉ ở `login`: refresh
    // token sống 7 ngày, nên nếu chỉ chặn đường đăng nhập thì một tài
    // khoản vừa bị vô hiệu hoá vẫn tự cấp access token mới suốt một tuần
    // — vô hiệu hoá trên giấy, không có thật.
    const account = await this.accounts.findOne({ where: { id: payload.sub } });
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueSession(account);
  }

  /**
   * Signs a fresh access/refresh token pair for an account already proven
   * to exist, and returns it alongside the public projection. The role is
   * re-read from the DB here so a role change lands in the next token
   * without a re-login.
   */
  private issueSession(account: AccountEntity): {
    accessToken: string;
    refreshToken: string;
    account: PublicAccount;
  } {
    const payload: AccessTokenPayload = {
      sub: account.id,
      email: account.email,
      role: account.role,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET,
      expiresIn: process.env.ACCESS_TOKEN_TTL ?? '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: process.env.REFRESH_TOKEN_TTL ?? '7d',
    });

    return {
      accessToken,
      refreshToken,
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
    };
  }
}
