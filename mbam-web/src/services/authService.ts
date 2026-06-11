import type {
  AuthProvider,
  AuthSession,
  AuthUser,
  LoginPayload,
  SignupPayload,
} from "../types/auth";
import { validateLoginInput, validateSignupInput } from "../utils/validation";
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
  refresh_token?: string;
}

interface BackendSignupPayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

const wait = () => new Promise((resolve) => window.setTimeout(resolve, ACTION_DELAY_MS));

function createToken(prefix: string): string {
  const randomValue = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${randomValue}`;
}

function buildSession(user: AuthUser, accessToken = createToken("mbam_local_access")): AuthSession {
  return {
    user,
    accessToken,
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
  const validated = validateLoginInput(payload);
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_login_input");
  }

  if (isApiConfigured()) {
    const response = await postJson<BackendAuthResponse, LoginPayload>("/api/v1/auth/login", validated.value);
    return saveSession(buildSessionFromBackend(response));
  }

  await wait();

  const user: AuthUser = {
    id: createToken("user"),
    fullName: validated.value.email.split("@")[0] || "Mbam User",
    email: validated.value.email,
    provider: "email",
    verified: true,
  };

  return saveSession(buildSession(user));
}

export async function signupWithEmail(payload: SignupPayload): Promise<AuthUser> {
  const validated = validateSignupInput(payload);
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_signup_input");
  }

  if (isApiConfigured()) {
    const response = await postJson<BackendAuthResponse, BackendSignupPayload>("/api/v1/auth/signup", {
      full_name: validated.value.fullName,
      email: validated.value.email,
      phone: validated.value.phone,
      password: validated.value.password,
    });
    const session = saveSession(buildSessionFromBackend(response));
    return session.user;
  }

  await wait();

  const user: AuthUser = {
    id: createToken("pending_user"),
    fullName: validated.value.fullName,
    email: validated.value.email,
    phone: validated.value.phone,
    provider: "email",
    verified: false,
  };

  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(user));
  return user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const validated = validateLoginInput({ email, password: "temporary-password-1A" });
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_email");
  }

  await wait();

  localStorage.setItem(
    RESET_REQUEST_KEY,
    JSON.stringify({ email: validated.value.email, requestedAt: new Date().toISOString() }),
  );
}

export async function resendVerification(email: string): Promise<void> {
  const validated = validateLoginInput({ email, password: "temporary-password-1A" });
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_email");
  }

  await wait();

  const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
  const pendingUser = raw ? (JSON.parse(raw) as AuthUser) : null;

  localStorage.setItem(
    PENDING_SIGNUP_KEY,
    JSON.stringify({
      ...(pendingUser ?? { email: validated.value.email }),
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
