# Pending API Implementations

This file is the running backend/API implementation tracker for the Mbam web app.

## Engineering role / rule

Whenever a UI feature is added with mock data, local-only state, placeholder buttons, frontend-only parsing, or a fallback API path, add a pending API implementation entry here in chronological order.

Each entry must include:

- **Deployment dependency:** `High`, `Medium`, or `Low`
- **Frontend status:** what exists in the UI today
- **Pending API work:** what backend/API work is still required
- **Suggested endpoint shape:** proposed endpoint or API contract
- **Why it matters:** deployment risk or product impact

Dependency scale:

- **High:** required for production deployment or core business correctness
- **Medium:** important for a complete deployed workflow, but the app can demo without it
- **Low:** improves polish, automation, or admin convenience, but is not blocking core deployment

---

## 2026-06-11 — Authentication and account/session persistence

**Deployment dependency:** High

**Frontend status:** Authentication screens and role-based access flows exist in the web app.

**Pending API work:** Replace local/mock authentication assumptions with real session handling, user identity lookup, token/session refresh, logout, and protected route enforcement backed by the server.

**Suggested endpoint shape:**

```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/refresh
```

**Why it matters:** Without real auth/session APIs, role access can be demonstrated but cannot be trusted in production.

---

## 2026-06-11 — Role and permission persistence for employees

**Deployment dependency:** High

**Frontend status:** Employee access UI supports recommended profiles: Shop Cashier, Shop Manager, Business Admin, and Custom permissions. Saving currently updates UI state only.

**Pending API work:** Persist employee role/profile/permission changes, validate that the current user can manage the selected employee, and return the updated employee access state.

**Suggested endpoint shape:**

```http
GET   /api/v1/team-members
PATCH /api/v1/team-members/:memberId/access
```

Example payload:

```json
{
  "roleId": "role-shop-manager",
  "permissionMode": "role-shop-manager",
  "permissions": ["Manage one shop", "View shop reports"],
  "businessId": "business-001",
  "businessUnitId": "unit-001"
}
```

**Why it matters:** Access control is security-sensitive. A production deployment cannot rely on local state for permissions.

---

## 2026-06-11 — Business, shop, and employee hierarchy APIs

**Deployment dependency:** High

**Frontend status:** Business/shop cards are clickable and route to scoped employees. The UI uses mock workspace businesses, units, and team members.

**Pending API work:** Provide real business, shop/unit, and employee hierarchy data scoped to the authenticated user.

**Suggested endpoint shape:**

```http
GET  /api/v1/businesses
GET  /api/v1/businesses/:businessId/units
GET  /api/v1/businesses/:businessId/team-members
POST /api/v1/businesses
POST /api/v1/business-units
```

**Why it matters:** Most dashboards, permissions, transactions, and product scopes depend on accurate business/shop hierarchy data.

---

## 2026-06-11 — Transaction creation with itemized products

**Deployment dependency:** High

**Frontend status:** Transaction recording supports selected products and payment/customer fields in the UI. Current transaction and product-sales relationships are mock-backed.

**Pending API work:** Create transactions with multiple line items, quantities, unit prices, payment method, customer, status, and recorded-by identity. The API must atomically persist the transaction and all product lines.

**Suggested endpoint shape:**

```http
POST /api/v1/transactions
```

Example payload:

```json
{
  "customerId": "customer-001",
  "businessId": "business-001",
  "businessUnitId": "unit-001",
  "paymentMethod": "cash",
  "status": "completed",
  "items": [
    { "productId": "product-001", "quantity": 2, "unitPrice": 12.5 },
    { "productId": "product-002", "quantity": 1, "unitPrice": 8.0 }
  ]
}
```

**Why it matters:** Transactions are the core record of sale. Product revenue, invoices, inventory, employee performance, and customer history depend on this being correct.

---

## 2026-06-11 — Transaction list filtering/search API

**Deployment dependency:** Medium

**Frontend status:** Transactions can be filtered by status/date and searched by Customer, Employee, or Product in the frontend. The previous role filter was removed.

**Pending API work:** Move filtering/search to API query parameters for production-size data sets.

**Suggested endpoint shape:**

```http
GET /api/v1/transactions?status=completed&date=today&searchMode=product&q=milk
GET /api/v1/transactions?searchMode=customer&q=bella
GET /api/v1/transactions?searchMode=employee&q=amina
```

**Why it matters:** Frontend filtering works for demos, but deployed stores need server-side pagination, search, and access scoping.

---

## 2026-06-11 — Printable invoice transaction detail API

**Deployment dependency:** High

**Frontend status:** Transaction rows are clickable and route to `/transactions/:transactionId/invoice`. The invoice page displays exact item lines from mock product sales and includes a print button using `window.print()`.

**Pending API work:** Provide a transaction invoice/detail endpoint that returns transaction metadata and exact line items with quantity, unit price, and total price.

**Suggested endpoint shape:**

```http
GET /api/v1/transactions/:transactionId/invoice
```

Example response:

```json
{
  "id": "txn-001",
  "reference": "TXN-001",
  "customerName": "Bella Market",
  "businessName": "Mbam Foods",
  "unitName": "Main Shop",
  "paymentMethod": "cash",
  "status": "completed",
  "recordedBy": "Amina Diallo",
  "createdAt": "2026-06-11T10:15:00Z",
  "currency": "AED",
  "items": [
    {
      "productId": "product-001",
      "name": "Nido Milk Powder",
      "sku": "NID-400",
      "quantity": 2,
      "unitPrice": 12.5,
      "lineTotal": 25.0
    }
  ],
  "total": 25.0
}
```

**Why it matters:** Invoices are customer-facing financial documents. They must be generated from persisted transaction data, not mock product-sales arrays.

---

## 2026-06-11 — Pending customer/payment APIs

**Deployment dependency:** High

**Frontend status:** Pending customer/payment dashboards and links exist using mock/scoped pending payment data.

**Pending API work:** Persist and retrieve customers with outstanding balances, last payment date, expected payment date, transaction references, and follow-up status.

**Suggested endpoint shape:**

```http
GET   /api/v1/pending-payments
PATCH /api/v1/pending-payments/:paymentId
POST  /api/v1/customers/:customerId/payments
```

**Why it matters:** Pending payments affect debt tracking and cash collection. This is business-critical for deployment.

---

## 2026-06-11 — Product revenue report API

**Deployment dependency:** Medium

**Frontend status:** Product revenue page calls `getProductRevenueReport()`. It tries an API path when configured and falls back to local mock product sales when no API base URL is configured.

**Pending API work:** Implement the product revenue report endpoint with scope filtering for master, business, shop, and cashier roles.

**Suggested endpoint shape:**

```http
GET /api/v1/reports/product-revenue
GET /api/v1/reports/product-revenue?businessId=business-001
GET /api/v1/reports/product-revenue?businessUnitId=unit-001
GET /api/v1/reports/product-revenue?recordedBy=Amina%20Diallo
```

**Why it matters:** Not as blocking as transaction creation, but deployed reporting must come from persisted transaction lines.

---

## 2026-06-11 — Product update API

**Deployment dependency:** High

**Frontend status:** Product table has an Edit Products mode. Edits currently update frontend draft state only.

**Pending API work:** Persist product edits including name, SKU, brand, category, available quantity, expiry date, and cost price. Validate role permissions before allowing updates.

**Suggested endpoint shape:**

```http
PATCH /api/v1/products/:productId
```

Example payload:

```json
{
  "name": "Nido Milk Powder",
  "sku": "NID-400",
  "brand": "Nestle",
  "category": "groceries",
  "availableQuantity": 120,
  "expiryDate": "2026-12-31",
  "costPrice": 9.5
}
```

**Why it matters:** The UI permits editing products, but production cannot lose those changes on refresh.

---

## 2026-06-12 — Product creation and bulk CSV import API

**Deployment dependency:** High

**Frontend status:** Product page has Add Product, multi-product entry columns, CSV file reading/parsing, CSV-to-product mapping, and similar-product warnings. Save New Products is UI-only.

**Pending API work:** Create single and bulk product APIs. Accept mapped products from manual entry or CSV import. Validate required fields, detect duplicates server-side, and return created products plus validation errors.

**Suggested endpoint shape:**

```http
POST /api/v1/products
POST /api/v1/products/bulk
```

Example bulk payload:

```json
{
  "products": [
    {
      "name": "Nido Milk Powder",
      "sku": "NID-400",
      "brand": "Nestle",
      "category": "groceries",
      "availableQuantity": 120,
      "expiryDate": "2026-12-31",
      "costPrice": 9.5
    }
  ]
}
```

**Why it matters:** This is required before product onboarding/import can be used in production.

---

## 2026-06-12 — Product duplicate/similarity validation API

**Deployment dependency:** Medium

**Frontend status:** While adding products, the UI checks product-name similarity against local mock products and shows a warning label above the product column.

**Pending API work:** Add server-side duplicate/similarity validation using product name, SKU, barcode, brand, manufacturer, package size, and unit of measure.

**Suggested endpoint shape:**

```http
POST /api/v1/products/validate
```

Example payload:

```json
{
  "products": [
    { "name": "Nido Milk", "sku": "NID-400", "brand": "Nestle" }
  ]
}
```

**Why it matters:** Frontend similarity checks help, but server-side validation is needed to prevent duplicate products across users, shops, and CSV imports.

---

## 2026-06-12 — Inventory stock ledger API

**Deployment dependency:** High

**Frontend status:** Available quantity is currently derived by subtracting mock product sales from product stock fields.

**Pending API work:** Replace derived mock inventory with a stock ledger/movement model that records stock opening balances, purchases, adjustments, sales, returns, expiry, and transfers.

**Suggested endpoint shape:**

```http
GET  /api/v1/products/:productId/inventory
POST /api/v1/inventory/movements
GET  /api/v1/inventory/movements?productId=product-001
```

Example movement payload:

```json
{
  "productId": "product-001",
  "businessUnitId": "unit-001",
  "type": "sale",
  "quantity": -2,
  "sourceTransactionId": "txn-001"
}
```

**Why it matters:** Production stock must not double-subtract sales or rely on a mutable `availableQuantity` field alone.

---

## 2026-06-12 — Employee performance/reporting API

**Deployment dependency:** Medium

**Frontend status:** Employee stats show revenue handled, transaction count, products sold, and product activity using mock transactions/product sales.

**Pending API work:** Provide scoped employee performance metrics by employee, business, shop, and date range.

**Suggested endpoint shape:**

```http
GET /api/v1/team-members/:memberId/performance?from=2026-06-01&to=2026-06-30
```

**Why it matters:** This is needed for accurate production reporting, but it can be deployed after core transaction persistence if necessary.

---

## 2026-06-12 — Print/report export APIs

**Deployment dependency:** Low

**Frontend status:** Transactions page has a placeholder Print button. Invoice page has browser print through `window.print()`.

**Pending API work:** Optional server-generated printable PDFs or export files for invoices, transactions, product reports, and pending-payment reports.

**Suggested endpoint shape:**

```http
GET /api/v1/transactions/:transactionId/invoice.pdf
GET /api/v1/reports/transactions.csv
GET /api/v1/reports/products.csv
```

**Why it matters:** Browser print is acceptable for an MVP. Server-side exports improve consistency, auditability, and sharing.
