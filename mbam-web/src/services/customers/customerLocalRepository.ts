import type { CustomerProfile } from "../../types/workspace";
import { decryptJson, encryptJson } from "../encryptionService";
import {
  deleteEncryptedEntity,
  getEncryptedEntitiesByType,
  getEncryptedEntity,
  putEncryptedEntity,
} from "../offlineDatabase";
import { requireOfflineDataKey } from "../offlineVaultService";
import type {
  LocalCustomerRecord,
  LocalCustomerSource,
  LocalCustomerSyncStatus,
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

function entityId(localId: string): string {
  return `customer:${localId}`;
}

export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
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

function mergeCustomer(
  existing: LocalCustomerRecord,
  input: CreateLocalCustomerInput,
): LocalCustomerRecord {
  const name = input.name.trim() || existing.name;
  return {
    ...existing,
    serverId: input.serverId ?? existing.serverId,
    name,
    normalizedName: normalizeCustomerName(name),
    contact: input.contact?.trim() || existing.contact,
    businessId: input.businessId ?? existing.businessId,
    businessUnitIds: uniqueValues([
      ...existing.businessUnitIds,
      ...(input.businessUnitIds ?? []),
    ]),
    attendedByNames: uniqueValues([
      ...existing.attendedByNames,
      ...(input.attendedByNames ?? []),
    ]),
    attendedByUserIds: uniqueValues([
      ...existing.attendedByUserIds,
      ...(input.attendedByUserIds ?? []),
    ]),
    lastPurchaseAt: input.lastPurchaseAt ?? existing.lastPurchaseAt,
    lastPaymentAt: input.lastPaymentAt ?? existing.lastPaymentAt,
    paymentDate: input.paymentDate ?? existing.paymentDate,
    totalSpent: Math.max(existing.totalSpent, input.totalSpent ?? 0),
    pendingBalance: Math.max(
      existing.pendingBalance,
      input.pendingBalance ?? 0,
    ),
    source:
      existing.source === "local"
        ? existing.source
        : (input.source ?? existing.source),
    syncStatus:
      existing.syncStatus === "queued"
        ? existing.syncStatus
        : (input.syncStatus ?? existing.syncStatus),
    updatedAt: new Date().toISOString(),
    rolePolicyVersion: input.rolePolicyVersion ?? existing.rolePolicyVersion,
  };
}

async function saveCustomer(customer: LocalCustomerRecord): Promise<void> {
  const id = entityId(customer.localId);
  await putEncryptedEntity({
    id,
    ownerId: customer.businessId ?? "unassigned",
    entityType: "customer",
    serverVersion: null,
    value: await encryptJson(requireOfflineDataKey(), customer, `entity:${id}`),
    updatedAt: customer.updatedAt,
  });
}

async function decodeCustomer(
  localId: string,
): Promise<LocalCustomerRecord | undefined> {
  const id = entityId(localId);
  const stored = await getEncryptedEntity(id);
  if (!stored) return undefined;
  return decryptJson<LocalCustomerRecord>(
    requireOfflineDataKey(),
    stored.value,
    `entity:${id}`,
  );
}

async function decodeAllCustomers(): Promise<LocalCustomerRecord[]> {
  const records = await getEncryptedEntitiesByType("customer");
  return Promise.all(
    records.map((record) =>
      decryptJson<LocalCustomerRecord>(
        requireOfflineDataKey(),
        record.value,
        `entity:${record.id}`,
      ),
    ),
  );
}

function matchesFilter(
  customer: LocalCustomerRecord,
  filters: ListLocalCustomersFilters,
): boolean {
  if (filters.businessId && customer.businessId !== filters.businessId)
    return false;
  if (
    filters.businessUnitId &&
    !customer.businessUnitIds.includes(filters.businessUnitId)
  )
    return false;
  if (
    filters.attendedByName &&
    !customer.attendedByNames.includes(filters.attendedByName)
  )
    return false;
  if (
    filters.attendedByUserId &&
    !customer.attendedByUserIds.includes(filters.attendedByUserId)
  )
    return false;
  if (filters.query) {
    const query = filters.query.trim().toLowerCase();
    const searchText = [customer.name, customer.contact]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchText.includes(query)) return false;
  }
  return true;
}

async function findExistingCustomerForUpsert(
  input: CreateLocalCustomerInput,
): Promise<LocalCustomerRecord | undefined> {
  const localId = input.localId ?? input.serverId;
  if (localId) return decodeCustomer(localId);

  const normalizedName = normalizeCustomerName(input.name);
  const customers = await decodeAllCustomers();
  return customers.find(
    (customer) =>
      customer.normalizedName === normalizedName &&
      customer.businessId === input.businessId,
  );
}

export async function createLocalCustomer(
  input: CreateLocalCustomerInput,
): Promise<LocalCustomerRecord> {
  const customer = createRecord(input);
  await saveCustomer(customer);
  return customer;
}

export async function upsertLocalCustomer(
  input: CreateLocalCustomerInput,
): Promise<LocalCustomerRecord> {
  const existing = await findExistingCustomerForUpsert(input);
  const next = existing ? mergeCustomer(existing, input) : createRecord(input);
  await saveCustomer(next);
  return next;
}

export async function upsertLocalCustomers(
  inputs: CreateLocalCustomerInput[],
): Promise<LocalCustomerRecord[]> {
  const saved: LocalCustomerRecord[] = [];
  for (const input of inputs) saved.push(await upsertLocalCustomer(input));
  return saved;
}

export async function getLocalCustomer(
  localId: string,
): Promise<LocalCustomerRecord | undefined> {
  return decodeCustomer(localId);
}

export async function listLocalCustomers(
  filters: ListLocalCustomersFilters = {},
): Promise<LocalCustomerRecord[]> {
  return (await decodeAllCustomers())
    .filter((customer) => matchesFilter(customer, filters))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function updateLocalCustomer(
  localId: string,
  updates: Partial<Omit<LocalCustomerRecord, "localId" | "createdAt">>,
): Promise<LocalCustomerRecord> {
  const existing = await decodeCustomer(localId);
  if (!existing) throw new Error("Local customer was not found.");
  const next: LocalCustomerRecord = {
    ...existing,
    ...updates,
    localId: existing.localId,
    normalizedName: updates.name
      ? normalizeCustomerName(updates.name)
      : existing.normalizedName,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await saveCustomer(next);
  return next;
}

export async function deleteLocalCustomer(localId: string): Promise<void> {
  await deleteEncryptedEntity(entityId(localId));
}

export async function deleteLocalCustomers(localIds: string[]): Promise<void> {
  await Promise.all(localIds.map(deleteLocalCustomer));
}

export function localCustomerToProfile(
  customer: LocalCustomerRecord,
): CustomerProfile {
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
