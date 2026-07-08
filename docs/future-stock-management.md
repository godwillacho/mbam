# Future stock management

This document prepares Mbam for a future inventory and stock management feature.

The feature is intentionally not active yet. The current priority is transaction recording, customer learning, product learning, and offline sync. Stock management should build on those foundations.

**Status (2026-07-08):** the backend ledger and sale-driven deduction described in sections 2 and 4 below are now live. `mbam-api/src/modules/stock/` provides a role-gated (`stock.movement.create`/`stock.movement.view`, granted to master_owner/business_admin/shop_manager, not cashier) manual stock-movement API (`POST`/`GET /api/v1/stock/movements`) for purchases, adjustments, transfers, damaged/expired/returned stock, and opening balances. `transactions::repository::create` now auto-writes a `movement_type: "sale"` ledger row and decrements `products.available_quantity` atomically as part of recording every sale that references a tracked product -- this is the *only* place a `"sale"` movement is ever written; the manual API rejects that movement type outright. `products.stock_policy` (`allow_negative`/`warn_when_low`/`block_when_empty`) is now a real, settable column, enforced on both the manual and sale-driven paths. Quantity tracking stays opt-in: a product with `available_quantity = null` is skipped by sale-driven deduction and rejected outright by the manual API. The `mbam-web/src/services/stock/stockLocalRepository.ts` offline queue (built 2026-07-05) can now sync for real via a new `"stock_movement"` sync-push/pull handler, reusing the offline-generated id so a retried push is idempotent. What's still missing: any UI (no stock ledger view, no "record a purchase" screen, no low-stock badge yet), and stock counts (section 5 below).

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

(This file was deleted as unreferenced dead code in the 2026-06-18 cleanup,
then recreated 2026-07-05 once `stockLocalRepository.ts` actually consumed
it -- keep this in sync if it's ever removed again.)

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

**Implemented, but not the way this section originally assumed:** `products` rows are already 1:1 with a `business_unit_id` (see 0008_product_unit_scope.sql) -- "Rice bag 25kg at Douala" and "Rice bag 25kg at Yaounde" are two separate product rows, each with its own `available_quantity`. There is no separate per-location stock-profile table; the quantity lives directly on the product row that already belongs to one shop. See the "Future backend tables" note below.

### 2. Sale-driven stock deduction

When a transaction is approved, each line item can create a stock movement:

```text
movementType: sale
quantityDelta: -quantitySold
sourceTransactionId: transactionId
```

**Implemented (2026-07-08)** in `transactions::repository::apply_sale_stock_deductions`, called from inside `transactions::repository::create`'s existing idempotency guard so a retried offline-sync push can never double-deduct.

### 3. Offline-first stock queue

When offline, the frontend should queue stock movements locally with the sale. During sync, the backend must validate:

- product exists
- user has permission for the business unit
- sale has not already deducted stock
- stock policy allows the movement
- conflict handling if stock changed on another device

**Partially implemented:** sales themselves are not queued as a separate stock movement -- they flow through the existing offline transaction queue, and the backend derives the stock movement automatically when that transaction syncs (see section 2). The *manual* movement types (purchase/adjustment/transfer/etc.) do have their own offline queue (`stockLocalRepository.ts` -> a `"stock_movement"` sync push/pull handler in `sync::service`), validated against product existence and `stock.movement.create` scope, with policy enforcement, on sync. Conflict handling across devices for concurrent manual movements on the same product is handled by a `SELECT ... FOR UPDATE` row lock, not a CRDT-style merge -- acceptable for now, revisit if this becomes a real bottleneck.

### 4. Stock policies

Possible policies:

- `allow_negative`: permit stock to go below zero, useful for informal shops
- `warn_when_low`: allow sale but show low-stock warning
- `block_when_empty`: prevent sale if stock is insufficient

**Implemented (2026-07-08)** as a real `products.stock_policy` column (default `warn_when_low`), enforced identically on both the manual movement API and sale-driven deduction. `warn_when_low` currently has no distinct enforced behavior beyond "don't block" -- there is no low-stock warning UI yet (see `low_stock_threshold`, which already existed on `products` and is still unused by any warning surface).

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

**`stock_movements` implemented (migration 0013_stock_movements.sql), `stock_profiles` turned out to be unnecessary** -- see section 1's note above. `stock_counts`/`stock_count_lines` are still just this proposal; no code exists for them yet.

## Important design rule

Stock should not be changed by editing a number directly. Every change should be a stock movement so the business can audit what happened.
