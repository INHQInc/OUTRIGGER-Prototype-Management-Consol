export type Role = "admin" | "member";

export interface ConsoleUser {
  email: string;
  name?: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface AccessCode {
  id: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface SessionPayload {
  sub: string; // email
  role: Role;
  name?: string;
}
