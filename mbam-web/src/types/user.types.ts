// ─────────────────────────────────────────────────────────────────────────────
// user.types.ts
// Core identity and access types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "cashier";

export type AuthProvider = "email" | "google" | "apple" | "microsoft";

export type Language = "en" | "fr";

// ── Raw user record (mirrors DB row) ─────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  language: Language;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// ── SSO identity linked to a user ────────────────────────────────────────────
export interface SSOIdentity {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerId: string;
  email: string;
  createdAt: string;
  lastUsedAt: string;
}

// ── Auth session (what the frontend holds after login) ───────────────────────
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresAt: number; // unix timestamp (ms)
}

// ── Auth request / response payloads ─────────────────────────────────────────
export interface SignupPayload {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
