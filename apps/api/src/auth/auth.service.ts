import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { In, IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload, PublicUser } from './types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ id: string }> {
    const existing = await this.users.findOne({
      where: { username: dto.username, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('Username already in use');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = this.users.create({
      username: dto.username,
      email: dto.email ?? null,
      passwordHash,
      displayName: dto.displayName,
      status: 'active',
    });
    const saved = await this.users.save(user);

    return { id: saved.id };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: PublicUser;
  }> {
    const user = await this.users.findOne({
      where: { username: dto.username },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const roleCodes = await this.getRoleCodes(user.id);

    await this.users.update(user.id, { lastLoginAt: new Date() });

    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      roles: roleCodes,
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
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: roleCodes,
      },
    };
  }

  private async getRoleCodes(userId: string): Promise<string[]> {
    const assignments = await this.userRoles.find({
      where: { userId, deletedAt: IsNull() },
    });
    if (assignments.length === 0) {
      return [];
    }
    const roleIds = assignments.map((a) => a.roleId);
    const roles = await this.roles.find({ where: { id: In(roleIds) } });
    return roles.map((r) => r.code);
  }
}
