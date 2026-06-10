# Migrations

This folder contains PostgreSQL migration files.

## Files

- `0001_initial_schema.sql` creates the first Mbam backend schema. It includes users, business accounts, businesses, business units, roles, permissions, memberships, auth sessions, refresh tokens, invitations, and audit logs.

Migrations are run by the API on startup during development. In production, they should be run as part of a controlled deployment step.
