import type { CustomerProfile } from "../../types/workspace";
import {
  getLocalSyncDb,
  type LocalCustomerRecord,
  type LocalCustomerSource,
  type LocalCustomerSyncStatus,
} from "../localSync/localSyncStore";

export interface CreateLocalCustomerInput {
  localId?: string;
  serverId?: string;
  name: string;
  contact?: string;
  businessId?: string;
  businessUnitIds?: string[];
  attendedByNames?: string[];
  attendedByUserIds?: string[];
  lastPurchaseAt?: string;
  lastPaymentAt?: string;
  paymentDate?: string;
  totalSpent?: number;
  pendingBalance?: number;
  source?: LocalCustomerSource;
  syncStatus?: LocalCustomerSyncStatus;
  rolePolicyVersion?: string;
}

export interface ListLocalCustomersFilters {
  businessId?: string;
  businessUnitId?: string;
  attendedByName?: string;
  attendedByUserId?: string;
  query?: string;
}

function createId(): string {
  return `customer-${crypto.randomUUID()}`;
}

export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function createRecord(input: CreateLocalCustomerInput): LocalCustomerRecord {
  const now = new Date().toISOString();
  const name = input.name.trim();

  if (name.length < 2) {
    throw new Error("Customer name must be at least 2 characters.");
  }

  return {
    localId: input.localId ?? input.serverId ?? createId(),
    serverId: input.serverId,
    name,
    normalizedName: normalizeCustomerName(name),
    contact: input.contact?.trim() || undefined,
    businessId: input.businessId,
    businessUnitIds: uniqueValues(input.businessUnitIds ?? []),
    attendedByNames: uniqueValues(input.attendedByNames ?? []),
    attendedByUserIds: uniqueValues(input.attendedByUserIds ?? []),
    lastPurchaseAt: input.lastPurchaseAt,
    lastPaymentAt: input.lastPaymentAt,
    paymentDate: input.paymentDate,
    totalSpent: input.totalSpent ?? 0,
    pendingBalance: input.pendingBalance ?? 0,
    source: input.source ?? "local",
    syncStatus: input.syncStatus ?? "queued",
    createdAt: now,
    updatedAt: now,
    rolePolicyVersion: input.rolePolicyVersion,
  };
}

function mergeCustomer(existing: LocalCustomerRecord, input: CreateLocalCustomerInput): LocalCustomerRecord {
  const name = input.name.trim() || existing.name;

  return {
    ...existing,
    serverId: input.serverId ?? existing.serverId,
    name,
    normalizedName: normalizeCustomerName(name),
    contact: input.contact?.trim() || existing.contact,
    businessId: input.businessId ?? existing.businessId,
    businessUnitIds: uniqueValues([...existing.businessUnitIds, ...(input.businessUnitIds ?? [])]),
    attendedByNames: uniqueValues([...existing.attendedByNames, ...(input.attendedByNames ?? [])]),
    attendedByUserIds: uniqueValues([...existing.attendedByUserIds, ...(input.attendedByUserIds ?? [])]),
    lastPurchaseAt: input.lastPurchaseAt ?? existing.lastPurchaseAt,
    lastPaymentAt: input.lastPaymentAt ?? existing.lastPaymentAt,
    paymentDate: input.paymentDate ?? existing.paymentDate,
    totalSpent: Math.max(existing.totalSpent, input.totalSpent ?? 0),
    pendingBalance: Math.max(existing.pendingBalance, input.pendingBalance ?? 0),
    source: existing.source === "local" ? existing.source : input.source ?? existing.source,
    syncStatus: existing.syncStatus === "queued" ? existing.syncStatus : input.syncStatus ?? existing.syncStatus,
    updatedAt: new Date().toISOString(),
    rolePolicyVersion: input.rolePolicyVersion ?? existing.rolePolicyVersion,
  };
}

function matchesFilter(customer: LocalCustomerRecord, filters: ListLocalCustomersFilters): boolean {
  if (filters.businessId && customer.businessId !== filters.businessId) return false;
  if (filters.businessUnitId && !customer.businessUnitIds.includes(filters.businessUnitId)) return false;
  if (filters.attendedByName && !customer.attendedByNames.includes(filters.attendedByName)) return false;
  if (filters.attendedByUserId && !customer.attendedByUserIds.includes(filters.attendedByUserId)) return false;

  if (filters.query) {
    const query = filters.query.trim().toLowerCase();
    const searchText = [customer.name, customer.contact].filter(Boolean).join(" ").toLowerCase();
    if (!searchText.includes(query)) return false;
  }

  return true;
}

export async function createLocalCustomer(input: CreateLocalCustomerInput): Promise<LocalCustomerRecord> {
  const db = await getLocalSyncDb();
  const customer = createRecord(input);
  await db.put("customers", customer);
  return customer;
}

export async function upsertLocalCustomer(input: CreateLocalCustomerInput): Promise<LocalCustomerRecord> {
  const db = await getLocalSyncDb();
  const localId = input.localId ?? input.serverId;
  const existing = localId ? await db.get("customers", localId) : undefined;
  const next = existing ? mergeCustomer(existing, input) : createRecord(input);
  await db.put("customers", next);
  return next;
}

export async function upsertLocalCustomers(inputs: CreateLocalCustomerInput[]): Promise<LocalCustomerRecord[]> {
  const saved: LocalCustomerRecord[] = [];

  for (const input of inputs) {
    saved.push(await upsertLocalCustomer(input));
  }

  return saved;
}

export async function getLocalCustomer(localId: string): Promise<LocalCustomerRecord | undefined> {
  const db = await getLocalSyncDb();
  return db.get("customers", localId);
}

export async function listLocalCustomers(filters: ListLocalCustomersFilters = {}): Promise<LocalCustomerRecord[]> {
  const db = await getLocalSyncDb();
  const customers = await db.getAll("customers");

  return customers
    .filter((customer) => matchesFilter(customer, filters))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function updateLocalCustomer(localId: string, updates: Partial<Omit<LocalCustomerRecord, "localId" | "createdAt">>): Promise<LocalCustomerRecord> {
  const db = await getLocalSyncDb();
  const existing = await db.get("customers", localId);
  if (!existing) throw new Error("Local customer was not found.");

  const next: LocalCustomerRecord = {
    ...existing,
    ...updates,
    localId: existing.localId,
    normalizedName: updates.name ? normalizeCustomerName(updates.name) : existing.normalizedName,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await db.put("customers", next);
  return next;
}

export async function deleteLocalCustomer(localId: string): Promise<void> {
  const db = await getLocalSyncDb();
  await db.delete("customers", localId);
}

export async function deleteLocalCustomers(localIds: string[]): Promise<void> {
  const db = await getLocalSyncDb();
  const tx = db.transaction("customers", "readwrite");
  await Promise.all(localIds.map((localId) => tx.objectStore("customers").delete(localId)));
  await tx.done;
}

export function localCustomerToProfile(customer: LocalCustomerRecord): CustomerProfile {
  return {
    id: customer.localId,
    name: customer.name,
    contact: customer.contact,
    businessId: customer.businessId,
    lastPurchaseAt: customer.lastPurchaseAt,
    lastPaymentAt: customer.lastPaymentAt,
    paymentDate: customer.paymentDate,
    totalSpent: customer.totalSpent,
    pendingBalance: customer.pendingBalance,
  };
}
