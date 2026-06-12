import type { SignedOfflineGrant } from "./offline.types";

export type AuthProvider = "google" | "apple" | "microsoft";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  provider: "email" | AuthProvider;
  verified: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  offlineGrant?: SignedOfflineGrant;
  createdAt: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}
