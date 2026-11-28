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

## SECURITY DEFINER advisory review (2026-11-28)

The Supabase Security Advisor currently reports eight authenticated-callable `SECURITY DEFINER` functions. This is a review warning, not by itself proof that the functions are exploitable. The current production definitions were inspected read-only:

- `accept_member_invites()` requires an authenticated user and accepts invitations only for the email in that user's JWT.
- `employee_assigned_vehicle(uuid, uuid)` scopes its lookup to `auth.uid()`, a current company membership, and that user's vehicle assignment.
- `has_module_permission(uuid, text, text)` returns owner access or an explicit manager/viewer permission for the requested module/action.
- `is_company_owner(uuid)` checks the caller's owner membership in the requested company.
- `my_companies()` returns only company IDs attached to `auth.uid()`.
- `owner_invite_member`, `owner_remove_member`, and `owner_set_member_permissions` enforce owner authorization; the permission setter also limits target roles and module names.

The application directly calls the invitation, owner-check, invite-member, remove-member, and set-permissions RPCs. The assignment and module-permission functions are also referenced by RLS policies. Do not blanket-revoke `EXECUTE`, or change these functions to `SECURITY INVOKER`, without tracing every policy and client call and running tenant-isolation tests. A targeted privilege reduction for an actually unused RPC such as `my_companies()` requires a separate usage review first.

The inspected definitions set `search_path` to `pg_catalog, public, pg_temp`. Keep this hardening in place for all privileged functions.

A separate Auth Advisor warning reports that leaked-password protection is disabled. Enable the leaked-password protection setting in Supabase Auth configuration as a dashboard release task, then verify the sign-in and password-reset flows. This setting was not changed during this code review.
