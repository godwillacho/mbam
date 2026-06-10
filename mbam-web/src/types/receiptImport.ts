// Future receipt image import contract.
//
// This file is intentionally not wired into the active UI yet. It prepares the
// frontend data shape for a future flow where a receipt image can be analyzed
// by an AI/OCR service, reviewed by the user, and converted into transaction
// line items.

export type ReceiptImportStatus =
  | "draft"
  | "image_selected"
  | "extracting"
  | "needs_review"
  | "approved"
  | "rejected";

export interface ReceiptImageDraft {
  localId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  previewUrl?: string;
}

export interface ExtractedReceiptItem {
  rawText: string;
  itemName?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  confidence: number;
  matchedProductId?: string;
}

export interface ExtractedReceiptCustomer {
  name?: string;
  contact?: string;
  matchedCustomerId?: string;
  confidence: number;
}

export interface ReceiptExtractionResult {
  importId: string;
  status: ReceiptImportStatus;
  image: ReceiptImageDraft;
  merchantName?: string;
  receiptNumber?: string;
  purchasedAt?: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  customer?: ExtractedReceiptCustomer;
  items: ExtractedReceiptItem[];
  warnings: string[];
}
