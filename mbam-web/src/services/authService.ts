import type {
  AuthProvider,
  AuthSession,
  AuthUser,
  LoginPayload,
  SignupPayload,
} from "../types/auth";
import { validateLoginInput, validateSignupInput } from "../utils/validation";
import { buildApiUrl, isApiConfigured, postJson } from "./apiClient";
import {
  getActiveSession,
  setActiveSession,
} from "./authSessionStore";
import { getDeviceBinding } from "./deviceBindingService";
import {
  getValidOfflineAuthorizationSnapshot,
} from "./offlineAuthorizationSnapshotService";
import {
  getValidOfflineGrant,
  importOfflineGrantPublicKey,
  saveOfflineGrant,
} from "./offlineSessionService";
import {
  hasOfflineVault,
  lockOfflineVault,
  setupOfflineVault,
  unlockOfflineVault,
} from "./offlineVaultService";

interface BackendAuthResponse {
  user: {
    id: string;
    full_name: string;
    email: string;
    email_verified: boolean;
  };
  access_token: string;
  refresh_token?: string;
  offline_grant?: string;
}

interface BackendSignupPayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

function buildSession(
  user: AuthUser,
  accessToken: string,
  offlineGrantToken?: string,
): AuthSession {
  return {
    user,
    accessToken,
    offlineGrant: offlineGrantToken ? { token: offlineGrantToken } : undefined,
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
    response.offline_grant,
  );
}

function saveSession(session: AuthSession): AuthSession {
  setActiveSession(session);
  return session;
}

export function getCurrentSession(): AuthSession | null {
  return getActiveSession();
}

export async function refreshCloudSession(): Promise<AuthSession> {
  const response = await postJson<BackendAuthResponse, Record<string, never>>(
    "/api/v1/auth/refresh",
    {},
  );
  return saveSession(buildSessionFromBackend(response));
}

export async function enableOfflineAccess(
  session: AuthSession,
  passphrase: string,
): Promise<void> {
  if (!session.offlineGrant) {
    throw new Error("offline_grant_unavailable");
  }
  const publicKeySpki = import.meta.env.VITE_OFFLINE_GRANT_PUBLIC_KEY_SPKI;
  if (!publicKeySpki) {
    throw new Error("offline_public_key_unavailable");
  }

  if (await hasOfflineVault(session.user.id)) {
    await unlockOfflineVault(passphrase, session.user.id);
  } else if (await hasOfflineVault()) {
    throw new Error("offline_vault_user_mismatch");
  } else {
    await setupOfflineVault(session.user.id, passphrase);
  }
  const publicKey = await importOfflineGrantPublicKey(publicKeySpki);
  await saveOfflineGrant(session.offlineGrant, publicKey);
}

export async function unlockOfflineSession(
  passphrase: string,
): Promise<AuthSession> {
  await unlockOfflineVault(passphrase);
  try {
    const grant = await getValidOfflineGrant();
    if (!grant) {
      throw new Error("offline_authorization_required");
    }

    const snapshot = await getValidOfflineAuthorizationSnapshot(grant.payload.userId);
    if (!snapshot) {
      throw new Error("offline_authorization_snapshot_required");
    }
    if (
      snapshot.authorizationVersion !== grant.payload.authorizationVersion ||
      snapshot.baselineRole !== grant.payload.baselineRole ||
      snapshot.businessIds.some((id) => !grant.payload.businessIds.includes(id)) ||
      snapshot.businessUnitIds.some(
        (id) => !grant.payload.businessUnitIds.includes(id),
      ) ||
      snapshot.permissions.some((permission) => !grant.payload.permissions.includes(permission))
    ) {
      throw new Error("offline_authorization_snapshot_stale");
    }

    const session: AuthSession = {
      ...snapshot.session,
      offlineGrant: { token: grant.token },
      createdAt: new Date().toISOString(),
    };
    setActiveSession(session);
    return session;
  } catch (error) {
    lockOfflineVault();
    throw error;
  }
}

export async function offlineAccessIsConfigured(): Promise<boolean> {
  return hasOfflineVault();
}

export async function loginWithEmail(
  payload: LoginPayload,
): Promise<AuthSession> {
  const validated = validateLoginInput(payload);
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_login_input");
  }

  if (!isApiConfigured()) {
    throw new Error("cloud_auth_required");
  }

  const response = await postJson<BackendAuthResponse, LoginPayload>(
    "/api/v1/auth/login",
    validated.value,
  );
  return saveSession(buildSessionFromBackend(response));
}

export async function signupWithEmail(
  payload: SignupPayload,
): Promise<AuthUser> {
  const validated = validateSignupInput(payload);
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_signup_input");
  }

  if (!isApiConfigured()) {
    throw new Error("cloud_auth_required");
  }

  const response = await postJson<BackendAuthResponse, BackendSignupPayload>(
    "/api/v1/auth/signup",
    {
      full_name: validated.value.fullName,
      email: validated.value.email,
      phone: validated.value.phone,
      password: validated.value.password,
    },
  );
  const session = saveSession(buildSessionFromBackend(response));
  return session.user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const validated = validateLoginInput({
    email,
    password: "temporary-password-1A",
  });
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_email");
  }

  await postJson<void, { email: string }>("/api/v1/auth/password-reset", {
    email: validated.value.email,
  });
}

export async function completePasswordReset(
  token: string,
  password: string,
): Promise<void> {
  await postJson<void, { token: string; password: string }>(
    "/api/v1/auth/password-reset/complete",
    { token, password },
  );
}

export async function resendVerification(email: string): Promise<void> {
  const validated = validateLoginInput({
    email,
    password: "temporary-password-1A",
  });
  if (!validated.ok || !validated.value) {
    throw new Error("invalid_email");
  }

  await postJson<void, { email: string }>("/api/v1/auth/verification/resend", {
    email: validated.value.email,
  });
}

export async function signInWithProvider(
  provider: AuthProvider,
): Promise<AuthSession> {
  await getDeviceBinding();
  window.location.assign(buildApiUrl(`/api/v1/auth/oauth/${provider}/start`));
  return new Promise<AuthSession>(() => undefined);
}
