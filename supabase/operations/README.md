# Supabase operational SQL files

Files in this directory are historical operational scripts, not an automatic deployment sequence.
Do not execute a script in production merely because it exists here.

## Explicitly superseded / unsafe to run without a new review

- `consolidate_fleet_rls_policies.sql`: its trips read policy permits access by assigned vehicle without requiring the authenticated driver to match `trips.driver_id`. The live production policy is stricter and requires the linked driver identity (or an explicit module permission / owner path). Running this old script would weaken trip-row isolation.
- `enforce_driver_trip_identity.sql`: this is an earlier policy patch. Compare it with the current migration history and live policies before considering any use.
- Other files may describe changes that have since been applied or superseded. Verify current production catalog state, migration ledger, and the complete SQL diff before any execution.

## Safe operating procedure

1. Prefer a new timestamped migration for future schema changes.
2. Review it against the current production schema and all relevant RLS policies.
3. Test on a disposable/development database first.
4. Confirm the migration is additive and preserves tenant/driver isolation.
5. Apply only through the approved release process with a backup and explicit production approval.
