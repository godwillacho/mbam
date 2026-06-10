import type {
  AuthProvider,
  AuthSession,
  AuthUser,
  LoginPayload,
  SignupPayload,
} from "../types/auth";
import { isApiConfigured, postJson } from "./apiClient";

const SESSION_KEY = "mbam_auth_session";
const PENDING_SIGNUP_KEY = "mbam_pending_signup";
const RESET_REQUEST_KEY = "mbam_password_reset_request";
const ACTION_DELAY_MS = 450;

interface BackendAuthResponse {
  user: {
    id: string;
    full_name: string;
    email: string;
    email_verified: boolean;
  };
  access_token: string;
  refresh_token: string;
}

const wait = () => new Promise((resolve) => window.setTimeout(resolve, ACTION_DELAY_MS));

function createToken(prefix: string): string {
  const randomValue = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${randomValue}`;
}

function buildSession(user: AuthUser, accessToken = createToken("mbam_local_access"), refreshToken?: string): AuthSession {
  return {
    user,
    accessToken,
    refreshToken,
    createdAt: new Date().toISOString(),
  };
}

function buildSessionFromBackend(response: BackendAuthResponse): AuthSession {
  return buildSession(
    {
      id: response.user.id,
      fullName: response.user.full_name,
      email: response.user.email,
      provider: "email",
      verified: response.user.email_verified,
    },
    response.access_token,
    response.refresh_token,
  );
}

function saveSession(session: AuthSession): AuthSession {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getCurrentSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function loginWithEmail(payload: LoginPayload): Promise<AuthSession> {
  if (isApiConfigured()) {
    const response = await postJson<BackendAuthResponse, LoginPayload>("/api/v1/auth/login", payload);
    return saveSession(buildSessionFromBackend(response));
  }

  await wait();

  const user: AuthUser = {
    id: createToken("user"),
    fullName: payload.email.split("@")[0] || "Mbam User",
    email: payload.email.trim().toLowerCase(),
    provider: "email",
    verified: true,
  };

  return saveSession(buildSession(user));
}

export async function signupWithEmail(payload: SignupPayload): Promise<AuthUser> {
  if (isApiConfigured()) {
    const response = await postJson<BackendAuthResponse, SignupPayload>("/api/v1/auth/signup", payload);
    const session = saveSession(buildSessionFromBackend(response));
    return session.user;
  }

  await wait();

  const user: AuthUser = {
    id: createToken("pending_user"),
    fullName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone?.trim() || undefined,
    provider: "email",
    verified: false,
  };

  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(user));
  return user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await wait();

  localStorage.setItem(
    RESET_REQUEST_KEY,
    JSON.stringify({ email: email.trim().toLowerCase(), requestedAt: new Date().toISOString() }),
  );
}

export async function resendVerification(email: string): Promise<void> {
  await wait();

  const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
  const pendingUser = raw ? (JSON.parse(raw) as AuthUser) : null;

  localStorage.setItem(
    PENDING_SIGNUP_KEY,
    JSON.stringify({
      ...(pendingUser ?? { email: email.trim().toLowerCase() }),
      verificationResentAt: new Date().toISOString(),
    }),
  );
}

export async function signInWithProvider(provider: AuthProvider): Promise<AuthSession> {
  await wait();

  const providerName = provider[0].toUpperCase() + provider.slice(1);
  const user: AuthUser = {
    id: createToken(`${provider}_user`),
    fullName: `${providerName} User`,
    email: `user@${provider}.mbam.local`,
    provider,
    verified: true,
  };

  return saveSession(buildSession(user));
}
