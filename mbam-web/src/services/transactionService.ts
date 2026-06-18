import { deleteJson, getJson, patchJson, postJson } from "./apiClient";
import type { PaymentMethod, TransactionStatus } from "../types/workspace";

interface TransactionLineInput {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateCloudTransactionInput {
  id?: string;
  businessId: string;
  businessUnitId?: string;
  customerName: string;
  customerContact?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "pending";
  outstandingAmount: number;
  idempotencyKey: string;
  createdAt?: string;
  lines: TransactionLineInput[];
}

interface CloudTransactionLine {
  id: string;
  transactionId: string;
  productId?: string;
  productNameSnapshot: string;
  skuSnapshot?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
}

export interface CloudTransaction {
  id: string;
  businessId: string;
  businessUnitId?: string;
  customerName: string;
  customerContact?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "pending";
  status: TransactionStatus;
  outstandingAmount: number;
  totalAmount: number;
  recordedByUserId: string;
  recordedBy: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  lines: CloudTransactionLine[];
}

export interface TransactionDraftInput {
  businessId?: string;
  businessUnitId?: string;
  customerName?: string;
  customerContact?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: "paid" | "pending";
  totalAmount?: number;
  amountPaid?: number;
  note?: string;
  useItemizedDetails?: boolean;
  lines: TransactionLineInput[];
}

export interface TransactionDraft extends TransactionDraftInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export async function createCloudTransaction(
  input: CreateCloudTransactionInput,
): Promise<CloudTransaction> {
  return postJson<CloudTransaction, CreateCloudTransactionInput>(
    "/api/v1/transactions",
    input,
  );
}

export async function listCloudTransactions(): Promise<CloudTransaction[]> {
  return getJson<CloudTransaction[]>("/api/v1/transactions");
}

export async function getCloudTransaction(id: string): Promise<CloudTransaction> {
  return getJson<CloudTransaction>(`/api/v1/transactions/${id}`);
}

export async function createTransactionDraft(input: TransactionDraftInput): Promise<TransactionDraft> {
  return postJson<TransactionDraft, TransactionDraftInput>("/api/v1/transactions/drafts", input);
}

export async function listTransactionDrafts(): Promise<TransactionDraft[]> {
  return getJson<TransactionDraft[]>("/api/v1/transactions/drafts");
}

export async function getTransactionDraft(id: string): Promise<TransactionDraft> {
  return getJson<TransactionDraft>(`/api/v1/transactions/drafts/${id}`);
}

export async function updateTransactionDraft(id: string, input: TransactionDraftInput): Promise<TransactionDraft> {
  return patchJson<TransactionDraft, TransactionDraftInput>(`/api/v1/transactions/drafts/${id}`, input);
}

export async function deleteTransactionDraft(id: string): Promise<void> {
  await deleteJson<{ deleted: boolean }>(`/api/v1/transactions/drafts/${id}`);
}
