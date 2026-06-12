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

## Current modules

Routed through local sync:

```text
Product revenue report reads
Transaction local CRUD foundation
```

Next candidates:

- route transaction record page through `createLocalTransaction`
- route transactions list page through `listLocalTransactions`
- route invoice page through `getLocalTransactionInvoice`
- pending payments reads
- business/shop hierarchy reads
- product list reads
- customer list reads
- queued transaction sync processor
