import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // No self-serve /auth/register: every account (including the first
  // admin) is provisioned deliberately — by an existing admin via
  // POST /accounts, or by hand for the very first one (see README) —
  // never by a stranger hitting a public endpoint. Account.role is NOT
  // NULL with no "pending, no role yet" state to land in, so there's no
  // safe role to hand out at self-signup time anyway.
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request) {
    // The refresh token lives in an httpOnly cookie the browser can't read,
    // so it arrives on the request rather than in a body — same place
    // JwtStrategy picks up `access_token`. Requires cookie-parser (wired in
    // main.ts) for `req.cookies` to be populated at all.
    return this.auth.refresh(req.cookies?.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  logout() {
    // Stateless JWTs: nothing to invalidate server-side. The Next.js
    // Route Handler that calls this endpoint is responsible for clearing
    // the httpOnly cookies on the browser.
    return;
  }
}
