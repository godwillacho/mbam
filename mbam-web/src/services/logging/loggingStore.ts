import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface BufferedLogRecord {
  id?: number;
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  createdAt: string;
}

interface MbamLoggingDb extends DBSchema {
  logs: {
    key: number;
    value: BufferedLogRecord;
    indexes: {
      "by-created-at": string;
    };
  };
}

const DATABASE_NAME = "mbam-logging";
const DATABASE_VERSION = 1;
const MAX_BUFFERED_LOGS = 200;

let databasePromise: Promise<IDBPDatabase<MbamLoggingDb>> | null = null;

function getDatabase(): Promise<IDBPDatabase<MbamLoggingDb>> {
  databasePromise ??= openDB<MbamLoggingDb>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("logs")) {
        const store = database.createObjectStore("logs", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-created-at", "createdAt");
      }
    },
  });
  return databasePromise;
}

export async function bufferLog(record: BufferedLogRecord): Promise<void> {
  const database = await getDatabase();
  await database.add("logs", record);

  const keys = await database.getAllKeysFromIndex("logs", "by-created-at");
  const expiredKeys = keys.slice(0, Math.max(0, keys.length - MAX_BUFFERED_LOGS));
  if (expiredKeys.length === 0) return;

  const transaction = database.transaction("logs", "readwrite");
  await Promise.all(expiredKeys.map((key) => transaction.store.delete(key)));
  await transaction.done;
}

export async function readBufferedLogs(): Promise<BufferedLogRecord[]> {
  return (await getDatabase()).getAllFromIndex("logs", "by-created-at");
}

export async function deleteBufferedLog(id: number): Promise<void> {
  await (await getDatabase()).delete("logs", id);
}
