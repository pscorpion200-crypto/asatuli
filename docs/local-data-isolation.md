# Local operational data isolation

## Scope

The browser-only operational supplements are isolated by both authenticated Supabase user ID and active company ID while the application is in cloud mode:

- vehicle inspection records
- incidents and incident summaries
- shift handover notes
- global, per-vehicle, and per-category budgets
- daily and dispatch checklists

The localStorage namespace is:

`asatuli:scope:<company_id>:<user_id>:<original_key>`

This prevents two signed-in users or two companies in the same browser profile from reading or overwriting each other's supplementary local records.

## Legacy device records

Keys created by older versions remain untouched in their original unscoped names. They are not copied into whichever account signs in first. While a cloud session is active, those records are hidden from the signed-in account and the application displays a warning with an export action.

The legacy export has no account/company binding. It must be reviewed by the data owner before anyone considers importing or assigning it.

## Backups and restore

A backup created while signed in records the exact company ID and user ID. Its supplementary local records may be restored only while signed in to that same account and company. The restore replaces only the browser-local supplements in that namespace; it does not write vehicles, drivers, fuel, maintenance, trips, or any Supabase table.

A backup created in local/demo mode has no account binding and may be restored only in local/demo mode. A cloud-scoped backup is rejected by the local/demo restore path.

## Important limitation

These records remain browser-local. Namespacing provides same-device account/company isolation; it does not synchronize them across devices and it is not a substitute for RLS-backed Supabase tables. Cloud synchronization should be a separate migration with a table-by-table data model, RLS policies, audit logging, and an explicit legacy-data ownership/import workflow.

## Rollout

No production database or existing localStorage records are changed by this code. The first cloud login uses a new scoped namespace, leaving historical unscoped records preserved until their owner exports and reviews them.
