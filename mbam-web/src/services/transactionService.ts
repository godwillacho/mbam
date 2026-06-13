import { getJson, postJson } from "./apiClient";
import type { PaymentMethod, TransactionStatus } from "../types/workspace";

export interface TransactionLineInput {
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

export interface CloudTransactionLine {
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

