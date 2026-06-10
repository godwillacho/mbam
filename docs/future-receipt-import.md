# Future receipt image import

This document prepares the project for a future receipt import feature.

The feature is intentionally not active yet. The goal is to prepare clean data contracts before adding image upload, OCR, or ChatGPT-powered extraction.

## Intended flow

1. User records a sale.
2. User optionally attaches or captures a receipt image.
3. The frontend stores the receipt draft locally while offline.
4. When online, the image is sent to a trusted backend endpoint.
5. The backend sends the image to an extraction service.
6. The extraction result returns possible customer, product, quantity, price, tax, and total values.
7. The user reviews and approves the extracted items.
8. Approved items become transaction line items.
9. New products and customer-specific prices can be learned after confirmation.

## Prepared frontend contract

See:

```text
mbam-web/src/types/receiptImport.ts
```

Prepared models:

- `ReceiptImageDraft`
- `ExtractedReceiptItem`
- `ExtractedReceiptCustomer`
- `ReceiptExtractionResult`

## Security and privacy rules

Receipt images may contain customer names, phone numbers, card references, addresses, or business-sensitive pricing. Before activating this feature, the backend should enforce:

- authenticated upload only
- file size limits
- MIME type validation
- image malware scanning where possible
- temporary storage lifecycle
- audit logging
- explicit user approval before saving extracted records
- no direct frontend calls to third-party AI providers

## Future backend endpoint idea

```http
POST /api/v1/receipt-imports
GET  /api/v1/receipt-imports/:id
POST /api/v1/receipt-imports/:id/approve
POST /api/v1/receipt-imports/:id/reject
```

## Important product behavior

The AI result should never silently create financial records. It should only suggest transaction details, products, customers, and prices. The user must confirm before the transaction is saved.
