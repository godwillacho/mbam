import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AuthSession } from "../types/auth";

const DATABASE_NAME = "mbam-auth";
const DATABASE_VERSION = 1;
const SESSION_ID = "active";

interface PersistedSessionRecord {
  id: "active";
  session: AuthSession;
  updatedAt: string;
}

interface MbamAuthSessionSchema extends DBSchema {
  sessions: {
    key: "active";
    value: PersistedSessionRecord;
  };
}

let databasePromise: Promise<IDBPDatabase<MbamAuthSessionSchema>> | null = null;

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDatabase(): Promise<IDBPDatabase<MbamAuthSessionSchema>> | null {
  if (!indexedDbAvailable()) return null;
  databasePromise ??= openDB<MbamAuthSessionSchema>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(database) {
        if (!database.objectStoreNames.contains("sessions")) {
          database.createObjectStore("sessions", { keyPath: "id" });
        }
      },
    },
  );

  return databasePromise;
}

export async function loadPersistedSession(): Promise<AuthSession | null> {
  const database = getDatabase();
  if (!database) return null;
  const record = await (await database).get("sessions", SESSION_ID);
  return record?.session ?? null;
}

export async function savePersistedSession(session: AuthSession): Promise<void> {
  const database = getDatabase();
  if (!database) return;
  await (await database).put("sessions", {
    id: SESSION_ID,
    session,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearPersistedSession(): Promise<void> {
  const database = getDatabase();
  if (!database) return;
  await (await database).delete("sessions", SESSION_ID);
}
