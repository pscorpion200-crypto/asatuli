# Asatuli staging verification plan

## Safety preconditions

- Run tests only against a dedicated Supabase development/preview branch or a separate disposable project.
- Never use real employee, customer, vehicle, or invoice data in test fixtures.
- Use test-only Auth users, a test company, a test vehicle, and a test driver.
- Use the branch-specific Supabase URL and publishable key in the Netlify preview. The preview now blanks production defaults and rejects the production project URL.
- Do not run the new migration against the production project as part of this plan.

## Database branch readiness gate

Before applying or testing `20261128082200_driver_operational_submission_idempotency.sql`:

1. Confirm the development branch is isolated and contains no copied production data.
2. Confirm all 12 production public tables and their columns, indexes, foreign keys, triggers, RLS policies, and required functions are present.
3. Compare the branch schema with the approved production schema snapshot. The repository currently has 18 migration files while the production migration ledger contains 65 entries; do not assume the repository alone can rebuild the schema from zero.
4. Confirm `fuel` and `maintenance` have RLS enabled, and the branch policies preserve the existing assigned-vehicle or module-permission authorization rules.
5. Apply the new migration only on the disposable branch, then verify both `submission_id` columns and the two partial unique indexes exist.

Stop the test if any schema, RLS, function, trigger, or migration-history prerequisite is missing.

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
- Keep the repository variable `ASATULI_DRIVER_RECORD_IDEMPOTENCY_READY` unset/false until the production migration `20261128082200_driver_operational_submission_idempotency.sql` is approved, applied, and verified to create both `submission_id` columns and both partial unique indexes.
- Only after that verification, set the repository variable to the literal `true` and trigger the GitHub Pages workflow on `main`. The deployment job is intentionally skipped while the variable is not true.
- Do not merge or publish to production until all checks pass and the migration has been reviewed and explicitly approved.

## Current limitation

The local supplement data is isolated by user and company in the same browser profile, but remains device-local and does not synchronize across devices. Moving it to Supabase requires separate tables, RLS policies, audit triggers, and a reviewed legacy-data ownership/import process.
