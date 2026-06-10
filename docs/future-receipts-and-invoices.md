# Future receipts and invoices

This document prepares Mbam for a future passive feature that generates receipts or invoices after a transaction is recorded.

The feature is intentionally not active yet. The current implementation should only prepare clean data contracts and workflow decisions.

## Intended workflow

1. A worker records a transaction.
2. The transaction contains customer details, payment status, line items, prices, totals, and outstanding balance if applicable.
3. Mbam selects the correct letterhead template based on the configured workflow.
4. Transaction line items are transformed into an invoice or receipt table.
5. The user previews the generated document.
6. The user exports, prints, downloads, or sends the receipt/invoice.

## Letterhead template scope

Letterheads may be configured at different levels depending on how the business operates.

Possible scopes:

- master account
- business/company
- business unit/shop
- region

Example:

```text
Master account: Mbam Central Trading
Business: Mbam Electronics
Region: Douala
Unit: Bonapriso Showroom
```

The system should choose the most specific active template first:

```text
business unit template
then region template
then business template
then master account template
```

## Letterhead input formats

Letterhead templates may be uploaded as:

- image files
- PDF files

The backend should validate file type, size, and ownership before storing the template.

## Prepared frontend contract

See:

```text
mbam-web/src/types/documentGeneration.ts
```

Prepared models:

- `LetterheadTemplate`
- `LetterheadTemplateAsset`
- `GeneratedDocumentDraft`
- `DocumentLineItem`
- `DocumentParty`
- `DocumentTotals`

## Document types

The system should support:

- receipt
- invoice

Receipt behavior:

- best for paid transactions
- shows payment method and paid status
- may show outstanding amount as zero

Invoice behavior:

- best for pending or partially paid transactions
- shows due date if available
- shows outstanding amount clearly

## Invoice table generation

The invoice table should be generated from transaction line items.

Example columns:

```text
Item name | Quantity | Unit price | Line total
```

Optional columns later:

```text
SKU | Discount | Tax | Notes
```

## Security and audit rules

Generated documents are financial records. The backend should enforce:

- authenticated generation only
- permission checks for the business or unit
- immutable generated document history where possible
- document number uniqueness
- audit logs for generated, sent, voided, and downloaded documents
- clear status for draft, generated, sent, and voided

## Important design rule

A generated receipt or invoice should be based on a recorded transaction. It should not become a separate source of truth for sales. The transaction remains the financial source of truth; the document is a formatted representation of that transaction.

## Future backend endpoint idea

```http
POST /api/v1/letterheads
GET  /api/v1/letterheads?scopeType=business&scopeId=:id
POST /api/v1/transactions/:id/documents
GET  /api/v1/documents/:id
POST /api/v1/documents/:id/void
```

## Future implementation note

PDF/image generation should happen on the backend so business rules, template access, document numbering, and audit logging are controlled centrally.
