# Local And Offline Data

MBAM stores authorized offline data in encrypted IndexedDB records. The vault
data key exists only in memory while unlocked, and the server-signed offline
grant limits disconnected access.

## Active modules

- `localSyncStore.ts` contains browser cache records and role-policy metadata.
- `localSyncClient.ts` marks role-policy changes for the next scoped refresh.
- `../offlineDatabase.ts` is the primary encrypted entity/outbox database.
- `../offlineSyncService.ts` pushes queued operations and applies scoped pulls.
- `../customers/customerLocalRepository.ts` stores scoped customer records.
- `../customers/customerBrowserDbService.ts` applies customer scope rules.
- `../transactions/transactionLocalRepository.ts` creates and reads encrypted
  local transactions and invoices.
- `../transactions/transactionBrowserDbService.ts` merges local and server
  transaction rows for the UI.
- `../stock/stockLocalRepository.ts` queues stock-movement drafts through the
  outbox (groundwork only -- no backend `stock` module or permission exists
  yet, see docs/future-stock-management.md).
- `../receiptImport/receiptImportLocalRepository.ts` queues captured receipt
  images through the outbox (groundwork only -- no backend endpoint or
  permission exists yet, see docs/future-receipt-import.md).

## Security rules

- Authentication, invitations, roles, permissions, and access revocation are
  direct-API operations and are never queued offline.
- Local records are removed when a server authorization snapshot no longer
  permits them.
- UI code uses browser DB services instead of bypassing scope filters.
- Plaintext business or customer records must not be written to IndexedDB.

## Connected UI paths

- Transaction entry writes a local encrypted transaction before navigation.
- Transactions list merges authorized server and local rows.
- Invoice view loads a local invoice when the server record is unavailable.
- Customer suggestions come from the scoped customer browser service.
- Product writes use the encrypted primary outbox and server version checks.
