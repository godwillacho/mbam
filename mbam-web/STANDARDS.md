# Mbam Code Standards

## 1. Comment Rules

Every file, function, class, getter, and method must have a comment
explaining its role. No exceptions. Future contributors (and future you)
should understand what something does without reading its implementation.

### File header
Every file starts with a block explaining:
- What the file is
- What it contains
- Any rules or constraints (e.g. "no side effects", "never call from UI")

```ts
// ─────────────────────────────────────────────────────────────────────────────
// models/Transaction.ts
// Transaction and TransactionItem domain model classes.
// These are the canonical objects used throughout the UI layer.
// Rule: TransactionItem always recomputes subtotal on construction —
//       never trust the raw value from the API.
// ─────────────────────────────────────────────────────────────────────────────
```

### Function/method comments
Every function gets a JSDoc block:
```ts
/**
 * Filter a list of transactions against a set of filter criteria.
 * All fields are optional — passing an empty object returns all transactions.
 *
 * @param transactions - Full list to filter
 * @param filters - Partial filter object; only defined fields are applied
 * @returns Filtered array (does not mutate the original)
 */
export function filterTransactions(...) {}
```

### Inline comments
Use inline comments for non-obvious logic only. If the code reads
clearly, don't add noise. If there's a reason something is done a
certain way (security, offline-first, immutability), say so:

```ts
// Always hash the password even if the email exists —
// prevents timing attacks that reveal whether an email is registered.
const hash = await hashPassword(password);
```

---

## 2. Tool Architecture

Every new feature is a self-contained Tool module. This enables:
- Independent billing per tool (owner pays for what they use)
- Clean enable/disable per business
- Future marketplace (third-party tools)

### Tool structure
```
src/tools/
  {tool-name}/
    index.ts          ← public API (what the rest of the app can call)
    {Tool}.model.ts   ← domain model if the tool has its own data
    {Tool}.service.ts ← API calls and business logic
    {Tool}.types.ts   ← types scoped to this tool
    README.md         ← what this tool does, its billing tier
```

### Tool registry
Every tool registers itself in `src/tools/registry.ts`.
The registry controls which tools are enabled for a given business.

### Built-in tools (core, always on)
- `record-sale` — record a transaction
- `transaction-history` — view past transactions

### Billable tools (phase 2+)
- `stock-management` — track product stock levels
- `cashier-management` — invite and manage cashier accounts
- `reports` — analytics and revenue reports
- `export` — CSV/PDF export of records
- `product-catalogue` — full product database with autocomplete

---

## 3. Git Discipline

- Every meaningful change gets its own commit
- Commit messages follow conventional commits:
  - `feat:` new feature or tool
  - `fix:` bug fix
  - `refactor:` restructure without behaviour change
  - `docs:` comments, README updates
  - `chore:` config, tooling, scripts
- Auto-push is handled by the `post-commit` git hook (see scripts/)
- Never commit `.env` files — use `.env.example`

---

## 4. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | PascalCase for classes, camelCase for modules | `User.ts`, `filters.ts` |
| Classes | PascalCase | `TransactionDraftModel` |
| Interfaces | PascalCase prefixed with I | `ITransaction` |
| Types | PascalCase | `UserRole` |
| Functions | camelCase, verb-first | `filterTransactions`, `formatCurrency` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Tools | kebab-case directories | `stock-management/` |
