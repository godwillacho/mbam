# API Development Rules

## 1. Every API logic feature must have a terminal switch runner

Whenever new backend/API logic is created, also create or update a terminal switch runner that can exercise that logic from the command line.

The goal is simple: before debugging through the frontend, we must be able to choose a scenario in the terminal and verify the backend behavior directly.

Examples:

```bash
cargo run --bin auth_switch
cargo run --bin transaction_switch
cargo run --bin product_switch
cargo run --bin pending_payment_switch
```

## 2. Switch runners must provide clear numbered options

Each switch runner should expose options for realistic roles/users/scopes.

Example for transactions:

```text
1. Read transactions as master owner
2. Read transactions as business admin
3. Read transactions as shop manager
4. Read transactions as cashier
5. Read one transaction invoice
6. Create itemized transaction
0. Exit
```

Example for products:

```text
1. List products as master owner
2. Add one product
3. Bulk import products from CSV fixture
4. Validate similar products
5. Update product stock
0. Exit
```

## 3. Switch runners are not replacements for tests

A switch runner is for fast local debugging and manual verification.

Each serious API module should still have:

- unit tests for validation/business rules
- repository tests for SQL behavior where practical
- route/integration tests for important endpoints

## 4. Switch runners must not depend on the frontend

Switch runners should call service functions directly or call local HTTP endpoints. They should not require the React frontend to be running.

## 5. Switch runners must identify the user context being tested

Any feature affected by role/scope must make the selected user context obvious.

Good:

```text
Running as: Cashier / Main Shop / Mbam Foods
```

Bad:

```text
Running test...
```

## 6. Switch runners should be safe for local development

Destructive actions must be clearly labelled.

Example:

```text
9. Delete seeded transaction [DESTRUCTIVE]
```

For production builds, switch binaries should not be used as operational tools unless explicitly designed and reviewed.
