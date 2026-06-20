import Keycloak from "keycloak-js";
import type { AuthSession } from "../types/auth";
import type { AuthorizationBootstrap } from "./authorizationService";
import { getDeviceBinding } from "./deviceBindingService";
import {
  clearActiveSession,
  getActiveSession,
  setActiveSession,
} from "./authSessionStore";

const enabled = import.meta.env.VITE_AUTH_PROVIDER === "keycloak";
const issuerUrl = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8081";
const realm = import.meta.env.VITE_KEYCLOAK_REALM || "mbam";
const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "mbam-web";
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const keycloak = enabled
  ? new Keycloak({ url: issuerUrl, realm, clientId })
  : null;

export function isKeycloakEnabled(): boolean {
  return enabled;
}

async function authorizedJson<T>(
  path: string,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  if (!keycloak?.token) throw new Error("keycloak_token_missing");
  const binding = await getDeviceBinding();
  const response = await fetch(`${apiBase}${path}`, {
    method,
    credentials: "include",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${keycloak.token}`,
      "x-mbam-device-id": binding.deviceId,
      "x-mbam-device-fingerprint": binding.fingerprintHash,
      "x-mbam-device-label": binding.deviceLabel,
    },
  });
  if (!response.ok) throw new Error(`keycloak_bootstrap_${response.status}`);
  return response.json() as Promise<T>;
}

async function createSession(): Promise<AuthSession> {
  if (!keycloak?.token) throw new Error("keycloak_token_missing");
  const authorization = await authorizedJson<AuthorizationBootstrap>(
    "/api/v1/me/authorization",
  );
  const grant = await authorizedJson<{ token: string }>(
    "/api/v1/me/offline-grant",
  ).catch(() => null);
  const session: AuthSession = {
    user: {
      id: authorization.identity.user_id,
      fullName: authorization.identity.full_name,
      email: authorization.identity.email,
      provider: "email",
      verified: true,
    },
    accessToken: keycloak.token,
    offlineGrant: grant ? { token: grant.token } : undefined,
    createdAt: new Date().toISOString(),
  };
  await authorizedJson<{ recorded: boolean }>("/api/v1/me/login-event", "POST")
    .catch(() => undefined);
  setActiveSession(session);
  return session;
}

export async function initializeKeycloak(): Promise<void> {
  if (!keycloak) return;
  keycloak.onTokenExpired = () => {
    void refreshKeycloakTokenIfNeeded(30).catch(() => {
      clearActiveSession();
      keycloak.clearToken();
    });
  };
  const authenticated = await keycloak.init({
    onLoad: "check-sso",
    pkceMethod: "S256",
    flow: "standard",
    checkLoginIframe: true,
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  });
  if (authenticated) {
    await createSession();
  } else {
    clearActiveSession();
  }
}

export async function refreshKeycloakTokenIfNeeded(
  minValidity = 30,
): Promise<void> {
  if (!keycloak?.authenticated || !keycloak.token) return;
  const syncSessionToken = () => {
    const session = getActiveSession();
    if (session && keycloak.token) {
      setActiveSession({ ...session, accessToken: keycloak.token });
    }
  };
  if (!keycloak.refreshToken) {
    syncSessionToken();
    return;
  }
  try {
    await keycloak.updateToken(minValidity);
  } catch {
    syncSessionToken();
    return;
  }
  syncSessionToken();
}

export async function loginWithKeycloak(
  redirectUri = `${window.location.origin}/dashboard-picker`,
): Promise<void> {
  if (!keycloak) throw new Error("keycloak_not_configured");
  await keycloak.login({ redirectUri });
}

export async function recoverKeycloakAccount(): Promise<void> {
  if (!keycloak) throw new Error("keycloak_not_configured");
  await keycloak.login({
    action: "UPDATE_PASSWORD",
    redirectUri: `${window.location.origin}/dashboard-picker`,
  });
}

export async function logoutFromKeycloak(): Promise<void> {
  await authorizedJson<{ recorded: boolean }>(
    "/api/v1/me/logout-event",
    "POST",
  ).catch(() => undefined);
  clearActiveSession();
  if (!keycloak) return;
  await keycloak.logout({ redirectUri: `${window.location.origin}/auth` });
}
