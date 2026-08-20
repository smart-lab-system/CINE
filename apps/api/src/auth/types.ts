export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: string[];
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}
