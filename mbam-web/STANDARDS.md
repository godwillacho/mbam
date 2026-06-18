# MBAM Web Standards

## Architecture

- `pages/` owns route-level UI and orchestration.
- `components/` owns reusable presentation and route guards.
- `services/` owns API, IndexedDB, encryption, synchronization, and logging.
- `security/` owns frontend authorization decisions.
- `types/` contains only contracts used by the running application.
- `data/` is development/demo fallback data and must not become an
  authorization source.

Do not introduce parallel class-based domain models. The canonical frontend
contracts live in `types/auth.ts`, `types/offline.types.ts`, and
`types/workspace.ts`.

## Security

- The server remains the authority for identity, permissions, and scope.
- Never persist access tokens outside the existing session store.
- Never log credentials, tokens, cookies, device fingerprints, customer
  details, or transaction payloads.
- Security-sensitive changes such as roles, permissions, invitations, and
  access revocation must use the API directly and must not be queued offline.
- Encrypt sensitive IndexedDB data through the offline vault helpers.
- Validate and normalize untrusted input at both the UI boundary and API.

## Modules

- Import the narrowest module needed; avoid broad barrel exports.
- Keep internal helpers unexported.
- Delete scaffolds when the real implementation lives elsewhere.
- Keep route handlers thin: validation and business rules belong in services.
- Keep network and storage access out of presentation components where
  practical.

## Quality

- TypeScript must pass `npm run type-check`.
- Frontend code must pass `npm run lint`.
- Tests must pass with `npm test`.
- Production output must pass `npm run build`.
- Every code change must update the required repository debug/error logs.

See [`../REPOSITORY_MAP.md`](../REPOSITORY_MAP.md) for the current module map.
