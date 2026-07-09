-- Lightweight per-batch expiry tracking for the stock movement ledger.
--
-- Design choice (see debug.log for the full discussion with the user):
-- this is metadata only, not full FEFO lot consumption. Each *incoming*
-- movement (purchase, opening_balance, transfer_in, returned, sale_refund)
-- may optionally record the expiry date of that specific batch. Sales and
-- other deductions keep drawing down the product's single aggregate
-- available_quantity exactly as before (transactions::repository.rs and
-- stock::repository::create are unchanged in that respect) -- this column
-- does not make the ledger track *which* batch a deduction came from, it
-- only lets the ledger answer "what batches were received, and when do
-- they expire" for a simple "expiring soon" view.
--
-- products.expiry_date (0005_products.sql) is left untouched by this
-- migration and by every code path that writes expiry_date here -- it
-- remains a separate, manually-edited, single-value field on the product
-- itself (surfaced in the product catalog table), not derived from this
-- ledger column, to avoid two sources of truth silently overwriting each
-- other.

alter table stock_movements
  add column if not exists expiry_date date;

-- Only ever meaningful on movements that increase quantity; enforced in
-- application code (stock::service::validate), not as a DB constraint,
-- since the check depends on movement_type which already has its own
-- application-level allow-list (MANUAL_MOVEMENT_TYPES) rather than a
-- database CHECK referencing another column.
create index if not exists idx_stock_movements_product_expiry
  on stock_movements (product_id, expiry_date)
  where expiry_date is not null;
