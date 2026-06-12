# Mbam Local Sync Layer

The local sync layer is the frontend gateway between UI modules and the Rust API.

## Core rule

All business modules should pass through this layer except security-sensitive operations.

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
2. If API succeeds, cache response in IndexedDB.
3. If offline or API fails, return cached response if available.
4. If no cache exists, return the module fallback data.

## Write behavior

For normal business writes:

1. If online and API is configured, try API first.
2. If API fails or device is offline, queue the write in IndexedDB.
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
Record Transaction page -> createLocalTransaction
Transactions page -> listBrowserDbTransactions
Invoice page -> getLocalTransactionInvoice first, mock invoice fallback second
```

Manual test path:

```text
1. Open /transactions/new
2. Record a sale
3. Confirm browser navigates to /transactions/<localId>/invoice
4. Go back to /transactions
5. Confirm the local queued transaction appears in the table
6. Click that local row
7. Confirm the invoice loads from IndexedDB
```

Still pending:

```text
Queued transaction sync processor
Rust API transaction create endpoint
Conflict/rejection UI
Local pending payment generation from pending local sales
Local inventory projection from queued sales
```

## Current modules

Routed through local sync/local browser storage:

```text
Product revenue report reads
Transaction local CRUD foundation
Transaction record/list/invoice UI
```

Next candidates:

- queued transaction sync processor
- pending payments reads
- business/shop hierarchy reads
- product list reads
- customer list reads
