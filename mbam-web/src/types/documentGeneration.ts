// Future receipt and invoice generation contract.
//
// This file is intentionally not wired into the active UI yet. It prepares the
// frontend data shape for generating receipts or invoices from recorded
// transactions using letterhead templates uploaded per company, business unit,
// or region.

export type DocumentKind = "receipt" | "invoice";

export type LetterheadScopeType = "master_account" | "business" | "business_unit" | "region";

export type LetterheadAssetType = "image" | "pdf";

export type LetterheadStatus = "draft" | "active" | "archived";

export type GeneratedDocumentStatus = "draft" | "generated" | "sent" | "voided";

export interface LetterheadTemplateAsset {
  localId: string;
  fileName: string;
  mimeType: string;
  assetType: LetterheadAssetType;
  sizeBytes: number;
  previewUrl?: string;
  uploadedAt?: string;
}

export interface LetterheadTemplate {
  id: string;
  name: string;
  scopeType: LetterheadScopeType;
  scopeId: string;
  regionName?: string;
  status: LetterheadStatus;
  asset: LetterheadTemplateAsset;
  pageSize: "A4" | "letter" | "receipt_80mm" | "custom";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentLineItem {
  productId?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DocumentParty {
  name: string;
  contact?: string;
  address?: string;
  taxId?: string;
}

export interface DocumentTotals {
  subtotal: number;
  tax?: number;
  discount?: number;
  paidAmount?: number;
  outstandingAmount?: number;
  total: number;
  currency: string;
}

export interface GeneratedDocumentDraft {
  localId: string;
  transactionId: string;
  documentKind: DocumentKind;
  documentNumber?: string;
  letterheadTemplateId?: string;
  seller: DocumentParty;
  customer?: DocumentParty;
  issuedAt: string;
  dueAt?: string;
  lineItems: DocumentLineItem[];
  totals: DocumentTotals;
  status: GeneratedDocumentStatus;
  outputPdfUrl?: string;
  outputImageUrl?: string;
  notes?: string;
}
