import type {
  AuthProvider,
  AuthSession,
  AuthUser,
  LoginPayload,
  SignupPayload,
} from "../types/auth";

const SESSION_KEY = "mbam_auth_session";
const PENDING_SIGNUP_KEY = "mbam_pending_signup";
const RESET_REQUEST_KEY = "mbam_password_reset_request";
const ACTION_DELAY_MS = 450;

const wait = () => new Promise((resolve) => window.setTimeout(resolve, ACTION_DELAY_MS));

function createToken(prefix: string): string {
  const randomValue = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${randomValue}`;
}

function buildSession(user: AuthUser): AuthSession {
  return {
    user,
    accessToken: createToken("mbam_local_access"),
    createdAt: new Date().toISOString(),
  };
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
