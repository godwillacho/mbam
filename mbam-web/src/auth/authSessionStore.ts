import type { AuthSession } from "../types/auth";
import {
  clearPersistedSession,
  loadPersistedSession,
  savePersistedSession,
} from "./authSessionPersistence";

const SESSION_STORAGE_KEY = "mbam-active-session";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredSession(): AuthSession | null {
  try {
    const value = storage()?.getItem(SESSION_STORAGE_KEY);
    if (!value) return null;
    return JSON.parse(value) as AuthSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession | null): void {
  const target = storage();
  if (!target) return;
  try {
    if (!session) {
      target.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures and continue with in-memory session state.
  }
}

let activeSession: AuthSession | null = readStoredSession();
let hydrationPromise: Promise<void> | null = null;

export async function hydrateActiveSession(): Promise<void> {
  if (activeSession) return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const session = await loadPersistedSession().catch(() => null);
    if (!session) return;
    activeSession = session;
    writeStoredSession(session);
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

export function setActiveSession(session: AuthSession): void {
  activeSession = session;
  writeStoredSession(session);
  void savePersistedSession(session);
}

export function getActiveSession(): AuthSession | null {
  if (activeSession) return activeSession;
  activeSession = readStoredSession();
  return activeSession;
}

export function getAccessToken(): string | null {
  return getActiveSession()?.accessToken ?? null;
}

export function clearActiveSession(): void {
  activeSession = null;
  writeStoredSession(null);
  void clearPersistedSession();
}
