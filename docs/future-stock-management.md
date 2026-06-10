# Future stock management

This document prepares Mbam for a future inventory and stock management feature.

The feature is intentionally not active yet. The current priority is transaction recording, customer learning, product learning, and offline sync. Stock management should build on those foundations.

## Why stock management fits Mbam

A sale transaction already contains:

- business account
- business
- business unit or shop
- customer
- line items
- product names
- quantities
- prices

Once products become real records, each sale line can optionally reduce stock for the selected shop or warehouse.

## Prepared frontend contract

See:

```text
mbam-web/src/types/stock.ts
```

Prepared models:

- `StockProfile`
- `StockMovementDraft`
- `StockCountDraft`
- `StockCountLine`

## Future stock behavior

### 1. Product stock per business unit

A product should have separate stock balances per shop, branch, warehouse, or sales desk.

Example:

```text
Rice bag 25kg
  Douala Main Shop: 12
  Yaounde Market Desk: 7
  Logistics Warehouse: 80
```

### 2. Sale-driven stock deduction

When a transaction is approved, each line item can create a stock movement:

```text
movementType: sale
quantityDelta: -quantitySold
sourceTransactionId: transactionId
```

### 3. Offline-first stock queue

When offline, the frontend should queue stock movements locally with the sale. During sync, the backend must validate:

- product exists
- user has permission for the business unit
- sale has not already deducted stock
- stock policy allows the movement
- conflict handling if stock changed on another device

### 4. Stock policies

Possible policies:

- `allow_negative`: permit stock to go below zero, useful for informal shops
- `warn_when_low`: allow sale but show low-stock warning
- `block_when_empty`: prevent sale if stock is insufficient

### 5. Stock counts

Stock counts allow workers to physically count inventory and submit corrections.

The backend should store both:

- expected quantity
- counted quantity
- difference

This creates an audit trail instead of silently changing stock.

## Future backend tables

Possible PostgreSQL tables:

```sql
products
stock_profiles
stock_movements
stock_counts
stock_count_lines
```

## Important design rule

Stock should not be changed by editing a number directly. Every change should be a stock movement so the business can audit what happened.
