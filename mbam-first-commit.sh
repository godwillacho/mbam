#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# mbam-first-commit.sh
#
# PURPOSE:
#   Run once on your local machine to create both GitHub repos,
#   push the initial codebase, and install the auto-push git hooks.
#
# REQUIRES:
#   - git installed
#   - gh CLI installed (https://cli.github.com) and logged in via `gh auth login`
#   - mbam-web/ and mbam-api/ directories in the current folder
# ─────────────────────────────────────────────────────────────────────────────

set -e

GITHUB_USER=$(gh api user --jq .login)
echo "GitHub user: $GITHUB_USER"

# ── Create repos ──────────────────────────────────────────────────────────────
echo ""
echo "Creating GitHub repositories..."

gh repo create mbam-api \
  --public \
  --description "Mbam backend — Rust + Axum microservice" \
  --confirm 2>/dev/null || echo "  mbam-api already exists, continuing..."

gh repo create mbam-web \
  --public \
  --description "Mbam frontend — React PWA (offline-first)" \
  --confirm 2>/dev/null || echo "  mbam-web already exists, continuing..."

# ── Push mbam-api ─────────────────────────────────────────────────────────────
echo ""
echo "Pushing mbam-api..."
cd mbam-api
git init
git add .
git commit -m "feat: initial scaffold

- Axum 0.7 web framework
- Argon2id password hashing
- JWT access + refresh token auth (15min / 30d)
- Email verification flow
- SSO: Google and Microsoft OAuth2
- Full domain model (domain.rs) with all enums and structs
- PostgreSQL migrations (users, tokens, sso_identities)
- ApiResponse<T> envelope
- Code standards: all functions commented"

git branch -M main
git remote add origin "https://github.com/$GITHUB_USER/mbam-api.git" 2>/dev/null || \
  git remote set-url origin "https://github.com/$GITHUB_USER/mbam-api.git"
git push -u origin main
cd ..
echo "✓ mbam-api pushed"

# ── Push mbam-web ─────────────────────────────────────────────────────────────
echo ""
echo "Pushing mbam-web..."
cd mbam-web
git init
git add .
git commit -m "feat: initial scaffold

- React 18 + TypeScript + Vite PWA
- Full type system (6 domain type files)
- Model classes: User, Business, CashierAccount, Product,
  Transaction, TransactionDraftModel, DailySummary, SyncRecord
- Filter library: filterTransactions, searchProducts, formatCurrency, etc.
- Tool registry with billing tier structure
- Auth screens: login, signup, SSO (Google/Microsoft)
- Password strength meter, email verification screen
- EN/FR language toggle
- STANDARDS.md: comment rules, tool architecture, git discipline
- Auto-push post-commit hook"

git branch -M main
git remote add origin "https://github.com/$GITHUB_USER/mbam-web.git" 2>/dev/null || \
  git remote set-url origin "https://github.com/$GITHUB_USER/mbam-web.git"
git push -u origin main
cd ..
echo "✓ mbam-web pushed"

# ── Install auto-push hooks ────────────────────────────────────────────────────
echo ""
echo "Installing auto-push git hooks..."
chmod +x mbam-web/scripts/setup-hooks.sh
./mbam-web/scripts/setup-hooks.sh

echo ""
echo "═══════════════════════════════════════════════════"
echo "  All done."
echo ""
echo "  mbam-api → https://github.com/$GITHUB_USER/mbam-api"
echo "  mbam-web → https://github.com/$GITHUB_USER/mbam-web"
echo ""
echo "  Every future commit will auto-push to GitHub."
echo "═══════════════════════════════════════════════════"
