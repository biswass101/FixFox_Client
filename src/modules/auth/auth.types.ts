import { UserRole } from '@prisma/client';

export interface TokenPayload {
  sub: string;
  orgId: string;
  role: UserRole;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUserResponse {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  skills: string[];
  organization: {
    id: string;
    name: string;
    slug: string;
    defaultCurrency: string;
  };
}

export interface RequestClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

