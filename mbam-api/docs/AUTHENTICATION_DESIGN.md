# Mbam Authentication Design

## Goal

Authentication must support two account creation paths:

1. **Primary account / owner signup** through Google or Microsoft OAuth.
2. **Invited staff signup** where a cashier or employee is invited by email and mapped under the inviter's primary/master account.

Password signup is not the preferred product direction for the MVP unless we keep it only as a local/debug fallback.

---

## Core rules

### 1. Primary users sign up with Google or Microsoft

A primary user is the person who creates the master account/workspace.

Flow:

1. User clicks `Continue with Google` or `Continue with Microsoft`.
2. API redirects to the provider authorization screen.
3. Provider returns an authorization code to the API callback route.
4. API exchanges the code for provider tokens.
5. API reads provider identity: email, provider subject/id, verified email, name/avatar if available.
6. API creates or finds the user.
7. If this is the first login for that email/provider identity, API creates the master account and owner membership.
8. API issues Mbam access/refresh tokens.

Suggested routes:

```http
GET /api/v1/auth/oauth/google/start
GET /api/v1/auth/oauth/google/callback
GET /api/v1/auth/oauth/microsoft/start
GET /api/v1/auth/oauth/microsoft/callback
GET /api/v1/auth/me
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

### 2. Cashier/staff accounts are created through invites

A cashier does not create an independent master account. They are invited into an existing master account/business/shop scope.

Flow:

1. Owner/admin creates invite for an email.
2. Invite stores: invited email, target master account, target business/shop scope, role, permissions, inviter, expiry, status.
3. Invited user receives email link.
4. User accepts invite using Google/Microsoft, or later a magic-link fallback if we choose to add one.
5. API verifies provider email matches invite email.
6. User completes required profile fields:
   - name
   - surname
   - contact
   - preferred name
7. API creates or links the user account.
8. API creates membership under the inviter's primary/master account.
9. API marks invite as accepted.
10. API returns Mbam access/refresh tokens.

Suggested routes:

```http
POST /api/v1/invites
GET  /api/v1/invites/:token
POST /api/v1/invites/:token/accept/oauth/google
POST /api/v1/invites/:token/accept/oauth/microsoft
POST /api/v1/invites/:token/complete-profile
```

### 3. Invite profile fields

Invited users must provide:

```json
{
  "first_name": "Amina",
  "surname": "Diallo",
  "contact": "+971501234567",
  "preferred_name": "Amina"
}
```

Recommended database fields:

```text
users.first_name
users.surname
users.preferred_name
users.email
users.phone/contact
users.avatar_url
users.status
```

Keep `full_name` as a generated/display field if desired, but avoid relying on it as the only name field.

---

## Options and tradeoffs

### Option A — OAuth-only for everyone

**Pros**

- Stronger security than passwords.
- Less password reset complexity.
- Faster user onboarding.
- Google/Microsoft email verification can be trusted when provider marks email as verified.

**Cons**

- Users without Google/Microsoft accounts cannot join.
- Requires OAuth app setup before production.
- Provider callback/localhost setup can confuse early debugging.

**Recommendation**

Use this for MVP if the target users commonly have Google/Microsoft accounts.

### Option B — OAuth for owners, magic-link for invited staff

**Pros**

- Cashiers can join without remembering passwords.
- Works well for employees with simple email access.
- Still avoids password storage for most users.

**Cons**

- Requires reliable email delivery.
- Magic links need strict expiry and replay protection.
- Adds another auth branch to maintain.

**Recommendation**

Good second phase if cashier onboarding friction becomes a problem.

### Option C — OAuth plus password fallback

**Pros**

- Easiest local/debug path.
- Works when OAuth setup is not ready.
- Supports users without provider accounts.

**Cons**

- Adds password reset, password policy, brute-force protection, and extra attack surface.
- Increases production security burden.

**Recommendation**

Keep password auth only as a local development fallback until we decide otherwise.

---

## My recommendation

For Mbam, use:

```text
Primary owners: Google/Microsoft OAuth
Invited staff/cashiers: invite token + Google/Microsoft OAuth + required profile completion
Local debugging: optional dev-only password flow or seeded test users
```

Why:

- Business ownership identity needs stronger trust.
- Staff should not create separate master accounts by accident.
- Invite acceptance should bind the staff account to the correct master account and scope.
- Backend must own this mapping. The frontend should only display the result.

---

## Required database concepts

Minimum tables/concepts:

```text
users
external_identities
business_accounts
memberships
roles
permissions
invites
refresh_tokens
```

Suggested `external_identities` columns:

```text
id
user_id
provider              -- google | microsoft
provider_subject      -- stable provider user id
email
email_verified
created_at
updated_at
```

Suggested `invites` columns:

```text
id
token_hash
invited_email
business_account_id
business_id
business_unit_id
role_id
permission_mode
permissions_json
invited_by_user_id
status                -- pending | accepted | expired | revoked
expires_at
accepted_at
created_at
updated_at
```

