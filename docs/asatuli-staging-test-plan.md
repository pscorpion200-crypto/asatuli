# Asatuli staging verification plan

## Safety preconditions

- Run tests only against a dedicated Supabase development/preview branch or a separate disposable project.
- Never use real employee, customer, vehicle, or invoice data in test fixtures.
- Use test-only Auth users, a test company, a test vehicle, and a test driver.
- Use the branch-specific Supabase URL and publishable key in the Netlify preview. The preview now blanks production defaults and rejects the production project URL.
- Do not run the new migration against the production project as part of this plan.

## Database branch readiness gate

Before applying or testing `20261128105009_driver_operational_submission_idempotency.sql` and `20261128105014_require_driver_role_for_assigned_vehicle_access.sql`:

1. Confirm the development branch is isolated and contains no copied production data.
2. Confirm all 12 production public tables and their columns, indexes, foreign keys, triggers, RLS policies, and required functions are present.
3. Compare the branch schema with the approved production schema snapshot. The repository currently has 20 migration files while the production migration ledger contains 67 entries; do not assume the repository alone can rebuild the schema from zero.
4. Confirm `fuel` and `maintenance` have RLS enabled, and the branch policies preserve the existing assigned-vehicle or module-permission authorization rules.
5. Apply the new migration only on the disposable branch, then verify both `submission_id` columns and the two partial unique indexes exist.

Stop the test if any schema, RLS, function, trigger, or migration-history prerequisite is missing.

## Production migration verification status (2026-11-28)

- Applied production migration `20261128105009_driver_operational_submission_idempotency.sql` and `20261128105014_require_driver_role_for_assigned_vehicle_access.sql`.
- Production ledger now contains 67 entries and records both migrations as `20261128105009` and `20261128105014`.
- Verified nullable `submission_id` columns on `fuel` and `maintenance`, plus both partial unique indexes.
- Verified the assigned-vehicle helper returns true for the linked assigned driver and false for an owner without an assignment.
- Temporary transactional inserts confirmed driver RLS visibility and duplicate-key rejection; all test transactions were rolled back and production `fuel` / `maintenance` row counts remained zero.
- These database checks do not replace the isolated browser tests below. A separate Supabase test branch and test users have not been created; real manager/driver sign-in, manager/viewer permission combinations, and multi-company switching remain unverified.

## Driver write idempotency

- Sign in with a test driver linked to the test company and assigned to the test vehicle.
- Save a fuel record with positive liters and zero price. Confirm exactly one row is created.
- Double-click the fuel, maintenance, and oil save controls. Confirm each action creates at most one row.
- Simulate a response timeout after the database has committed a write. Retry the exact same form data. Confirm the app finds the existing row through the unique idempotency key and does not create a second row.
- While a request is unresolved, alter the form values and retry. Confirm the app blocks the changed payload rather than generating a new key.
- Corrupt a pending key in localStorage in the test browser. Confirm the app fails closed and does not issue another insert.
- Confirm the form remains usable after a confirmed successful save.

## Authorization and tenant isolation

- Confirm a driver can read/write only the assigned vehicle records allowed by current production RLS.
- Confirm the driver cannot insert fuel or maintenance against an unassigned vehicle or another company.
- In the isolated test database, assign a test vehicle to a manager/viewer without module grants and confirm that assignment alone does not grant driver-scoped fuel or maintenance access.
- Confirm an assigned test driver retains the intended fuel and maintenance access.
- Confirm manager access continues to follow explicit module permissions.
- Confirm the new idempotency fields do not grant extra read, insert, update, or delete permissions.
- Confirm the historical `consolidate_fleet_rls_policies.sql` script is not applied.

## Local-only records and account switching

Use two test users and, where possible, two test companies in the same browser profile.

- Create an inspection, incident, handover note, budget, daily checklist, and dispatch checklist under user A/company A.
- Sign in as user B/company A. Confirm user A's scoped local records are not displayed.
- Sign in as user A/company B. Confirm company A's records are not displayed.
- Switch back to user A/company A. Confirm the original scoped records return.
- Confirm legacy unscoped local keys are not silently imported into any signed-in account.
- Export legacy local records and verify the downloaded JSON is labelled as unassigned device-local data.
- Confirm sign-out does not expose legacy local records inside a signed-in session.

## Company switching and atomic refresh

- Sign in as a user who belongs to two test companies with different roles.
- Switch from company A to company B and confirm every core table is reloaded under company B before the screen is updated.
- Simulate a read failure on one core table during a full refresh. Confirm no subset of the old/new company arrays is committed.
- Simulate a company switch failure and confirm the previous company ID, local storage scope, cached core data, page role, and realtime channel are restored.
- Confirm switching between a manager and driver membership routes to the correct page for the selected company.
- Switch between two driver memberships in different companies. Confirm the previous driver portal is removed and the new portal displays only the newly selected company's assigned vehicle.

## Backup and restore

- Create a cloud backup while signed in as user A/company A.
- Restore it while still signed in as user A/company A. Confirm only local supplementary records are restored.
- Attempt to restore the same backup as user B or while company B is active. Confirm it is rejected without changing local or cloud data.
- Attempt to restore a cloud-scoped backup in local/demo mode. Confirm it is rejected.
- Confirm a local/demo backup still restores only in local/demo mode.
- Confirm restore rollback leaves the previous scoped local records intact if a write to localStorage fails.

## Release checks

- Confirm the Netlify deploy preview starts with blank Supabase URL/key when it has no preview-specific configuration.
- Confirm a production Supabase URL is rejected from the `deploy-preview-*.netlify.app` origin.
- Confirm the preview can connect using only the dedicated branch URL/key and test-only users.
- Confirm GitHub Pages deployment remains blocked unless the static checker and both Deno checks pass.
- The two production migrations are now applied and verified under ledger versions `20261128105009` and `20261128105014`. Their nullable `submission_id` columns, partial unique indexes, and driver-only assignment helper are present.
- Keep `ASATULI_PRODUCTION_MIGRATIONS_READY` unset/false until isolated end-to-end account tests, review, and release approval are complete. Do not unlock the production Pages deploy from this staging checklist alone.
- After the isolated manager/driver/role-switch tests pass and release approval is recorded, set the repository variable to the literal `true` and trigger the GitHub Pages workflow on `main`. The deployment job remains intentionally skipped while the variable is not true.
- Do not merge or publish to production until the remaining end-to-end tests and release approval are complete.

## Current limitation

The local supplement data is isolated by user and company in the same browser profile, but remains device-local and does not synchronize across devices. Moving it to Supabase requires separate tables, RLS policies, audit triggers, and a reviewed legacy-data ownership/import process.
