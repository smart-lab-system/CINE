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
