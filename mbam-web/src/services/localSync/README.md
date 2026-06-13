# Mbam Local Sync Layer

The local sync layer is the frontend gateway between UI modules and the Rust API.

## Core rule

All business modules should pass through this layer except security-sensitive operations.

Sensitive cached records and queued writes are encrypted with AES-GCM before
they enter IndexedDB. The data key exists only in memory while the offline vault
is unlocked. A passphrase-derived key wraps the data key, and the cloud-signed
offline grant controls the maximum disconnected-access period.

Direct API only:

- authentication
- OAuth callbacks
- invite acceptance
- role changes
- permission changes
- team-member access changes

These operations must never be queued offline because stale or unauthorized security decisions would be dangerous.

## Read behavior

For normal business reads:

1. If online and API is configured, try API first.
2. If API succeeds and the vault is unlocked, encrypt and cache the response in IndexedDB.
3. If offline or API fails, return cached response if available.
4. If no cache exists, return the module fallback data.

## Write behavior

For normal business writes:

1. If online and API is configured, try API first.
2. If API fails or the device is offline, encrypt and queue the write in IndexedDB.
3. A future queue processor will retry queued writes.

## Role change behavior

Role/permission changes go directly to the API.

When a role policy changes, the app should mark local data as requiring a refresh. Once the device is online, modules should redownload scoped data from the API so the local cache matches the user's new permissions.

The first helpers for this are:

```ts
markRolePolicyChanged(nextVersion)
shouldRefreshLocalDataForRoleChange()
markRolePolicyRefreshComplete()
```

## Customer local CRUD and scoped download

Customers now have a dedicated IndexedDB store:

```text
customers
```

Available customer CRUD functions:

```ts
createLocalCustomer(input)
upsertLocalCustomer(input)
upsertLocalCustomers(inputs)
getLocalCustomer(localId)
listLocalCustomers(filters)
updateLocalCustomer(localId, updates)
deleteLocalCustomer(localId)
deleteLocalCustomers(localIds)
localCustomerToProfile(customer)
```

The customer browser DB service is responsible for role-scoped customer download/cache behavior:

```ts
listBrowserDbCustomers(member)
upsertBrowserDbCustomerFromTransaction(input)
```

Role scoping rules:

```text
Master owner:
  downloads all customers.

Business admin:
  downloads customers under assigned business.

Shop manager:
  downloads customers with transactions or pending balances in assigned shop/unit.

Cashier:
  downloads only customers they attended to personally.
```

This matters because local storage is not just a cache; it can remain on the device while offline. We should not store customer records locally when the current role is not allowed to see them.

## Transaction local CRUD

Transactions now have dedicated IndexedDB stores:

```text
transactions
transactionLines
```

Available CRUD functions:

```ts
createLocalTransaction(input)
listLocalTransactions(filters)
getLocalTransaction(localId)
getLocalTransactionLines(localId)
getLocalTransactionWithLines(localId)
updateLocalTransaction(localId, updates)
replaceLocalTransactionLines(localId, lines)
deleteLocalTransaction(localId)
getLocalTransactionInvoice(localId)
```

Available sync-state helpers:

```ts
markLocalTransactionSyncing(localId)
markLocalTransactionSynced(localId, serverId, serverReference)
markLocalTransactionFailed(localId, reason)
markLocalTransactionRejected(localId, reason)
```

Important rules:

- Transactions store local IDs and eventual server IDs separately.
- Each transaction has an idempotency key for safe retry later.
- Transaction lines store product name, SKU, quantity, unit price, and line total snapshots.
- Local invoices can be generated before the transaction syncs to the API.
- Deleting a local transaction deletes its local line items too.

## Transaction browser DB service

`transactionBrowserDbService.ts` owns the browser DB merge logic for the transactions UI.

It is responsible for:

```text
loading scoped local transactions
loading local transaction line items
converting local transactions into table rows
converting workspace fallback transactions into table rows
merging local + workspace rows
removing local rows once their serverId appears in workspace/API rows
sorting newest first
```

The transactions page should call only:

```ts
listBrowserDbTransactions(currentMember, scopedWorkspaceTransactions)
```

The transactions page must not directly import `listLocalTransactions` or `getLocalTransactionLines`.

## UI connection status

Connected to browser IndexedDB:

```text
Record Transaction page -> listBrowserDbCustomers for customer suggestions
Record Transaction page -> upsertBrowserDbCustomerFromTransaction before sale save
Record Transaction page -> createLocalTransaction
Transactions page -> listBrowserDbTransactions
Transactions customer search -> TransactionBrowserRow.customerContact
Invoice page -> getLocalTransactionInvoice first, mock invoice fallback second
```

Manual test path:

```text
1. Open /transactions/new
2. Type a customer name/contact and confirm suggestions come from scoped local customer cache
3. Record a sale
4. Confirm the customer is upserted into IndexedDB
5. Confirm browser navigates to /transactions/<localId>/invoice
6. Go back to /transactions
7. Confirm the local queued transaction appears in the table
8. Search by customer name or contact
9. Click that local row and confirm the invoice loads from IndexedDB
```

Still pending:

```text
Rust API transaction create endpoint
Rust API customer create/update/list endpoints
Conflict/rejection UI
Local pending payment generation from pending local sales
Local inventory projection from queued sales
Pending payments page customer lookup through local customer service
```

## Current modules

Routed through local sync/local browser storage:

```text
Product revenue report reads
Customer local CRUD and role-scoped browser cache
Transaction local CRUD foundation
Transaction record/list/invoice UI
```

Next candidates:

- queued transaction sync processor
- pending payments reads
- business/shop hierarchy reads
- product list reads
- product create, bulk import, update, and disable operations

The product catalogue uses `VITE_API_BASE_URL` when the API is deployed on a
separate origin and same-origin `/api` paths behind the included Nginx proxy.
Offline product writes use the encrypted primary outbox and retain the server
version used for conflict detection. A successful role-scoped pull removes
products and queued writes that are no longer authorized.
