import type { AuthSession } from "../types/auth";

let activeSession: AuthSession | null = null;

export function setActiveSession(session: AuthSession): void {
  activeSession = session;
}

export function getActiveSession(): AuthSession | null {
  return activeSession;
}

export function getAccessToken(): string | null {
  return activeSession?.accessToken ?? null;
}

export function clearActiveSession(): void {
  activeSession = null;
}
