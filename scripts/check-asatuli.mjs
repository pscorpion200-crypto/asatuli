import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import {
  detectInvoiceType,
  MAX_INVOICE_COUNT,
  MAX_INVOICE_SIZE,
} from "../supabase/functions/_shared/invoice-file-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "asatuli_plus.html"), "utf8");
const policy = readFileSync(
  resolve(root, "supabase/operations/restrict_trip_invoice_upload_to_assigned_driver.sql"),
  "utf8",
);
const uploadFunction = readFileSync(
  resolve(root, "supabase/functions/driver-save-trip-with-invoices/index.ts"),
  "utf8",
);
const driverAccountFunction = readFileSync(
  resolve(root, "supabase/functions/owner-create-driver/index.ts"),
  "utf8",
);
const driverRoleMigration = readFileSync(
  resolve(root, "supabase/migrations/20261126221036_driver_role_and_scoped_portal.sql"),
  "utf8",
);
const tripSubmissionIdempotencyMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127223849_trip_submission_idempotency.sql"),
  "utf8",
);
const fleetOptimisticLockMigration = readFileSync(
  resolve(root, "supabase/migrations/20261128042012_fleet_record_optimistic_locking.sql"),
  "utf8",
);
const driverApprovalRepair = readFileSync(
  resolve(root, "supabase/operations/driver_portal_access_repair.sql"),
  "utf8",
);
const driverApprovalMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127181416_harden_employee_approval_driver_role_and_unique_link.sql"),
  "utf8",
);
const duplicateDriverIndexCleanupMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127182508_remove_duplicate_driver_user_index.sql"),
  "utf8",
);
const removedMemberAccessMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127185231_revoke_removed_member_vehicle_and_invoice_access.sql"),
  "utf8",
);
const edgeConfig = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const unusedRpcRevocationMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127185742_revoke_unused_legacy_rpc_endpoints.sql"),
  "utf8",
);
const createCompanyRpcRevocationMigration = readFileSync(
  resolve(root, "supabase/migrations/20261128043517_revoke_authenticated_create_company_rpc.sql"),
  "utf8",
);

const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];

const nonEmptyScriptBodies = blocks.map((match) => match[1].trim()).filter(Boolean);
assert.equal(
  new Set(nonEmptyScriptBodies).size,
  nonEmptyScriptBodies.length,
  "The active HTML page must not contain byte-for-byte duplicate inline scripts",
);
assert.equal(
  blocks.filter((match) => match[1].includes("window.createDriverAccount=async function")).length,
  1,
  "Only one active driver-account creation handler may be registered",
);
const driverAccountUiStart = html.indexOf("// لوحة إنشاء حسابات السائقين");
const driverAccountUiEnd = html.indexOf("</script>", driverAccountUiStart);
assert.ok(driverAccountUiStart >= 0 && driverAccountUiEnd > driverAccountUiStart, "Driver account UI script must exist");
const driverAccountUiSource = html.slice(driverAccountUiStart, driverAccountUiEnd);
assert.ok(driverAccountUiSource.includes("const nav=sidebar.querySelector('.nav')||sidebar;"), "Driver account action must live inside the responsive navigation");
assert.ok(driverAccountUiSource.includes("b.onclick=()=>window.openCreateDriver();"), "Driver account action must defer resolving its handler until click time");
assert.ok(driverAccountUiSource.includes("await loadCloud('drivers')"), "Driver list must refresh after an account is created");


const markupForIds = html
  .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>")
  .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, "$1</style>");
const htmlIds = [...markupForIds.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
const duplicateHtmlIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateHtmlIds)], [], "Active HTML markup must not contain duplicate element IDs");

const styleBodies = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
assert.equal(new Set(styleBodies).size, styleBodies.length, "The page must not contain duplicate style blocks");

// Scan source files for exact duplicate copies (for example, accidentally saved .html.html backups).
const sourceExtensions = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sql"]);
const ignoredDirectories = new Set([".git", "node_modules", ".next", "dist", "_site"]);
function collectSourceFiles(directory) {
  const collected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) collected.push(...collectSourceFiles(resolve(directory, entry.name)));
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      const extension = dot >= 0 ? entry.name.slice(dot) : "";
      if (sourceExtensions.has(extension)) collected.push(resolve(directory, entry.name));
    }
  }
  return collected;
}
const sourceHashes = new Map();
for (const sourcePath of collectSourceFiles(root)) {
  const hash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
  const paths = sourceHashes.get(hash) ?? [];
  paths.push(sourcePath.slice(root.length + 1));
  sourceHashes.set(hash, paths);
}
const duplicatedSourceFiles = [...sourceHashes.values()].filter((paths) => paths.length > 1);
assert.deepEqual(duplicatedSourceFiles, [], "Repository must not contain byte-for-byte duplicate source files");

assert.ok(
  html.includes('id="oil-odometer-auto-calc"') &&
    html.includes("String(current + 5000)") &&
    html.includes("window.initAsatuliDriverPortal"),
  "Driver oil interval must calculate the next service at 5,000 km when the portal initializes",
);
assert.ok(
  !html.includes("setInterval(draw,4000)"),
  "Oil overview must update through data refresh/render hooks, not a four-second polling loop",
);
assert.ok(blocks.length > 0, "No script blocks were found");

for (let index = 0; index < blocks.length; index += 1) {
  try {
    new Function(blocks[index][1]);
  } catch (error) {
    throw new Error("JavaScript block " + (index + 1) + " failed syntax validation: " + error.message);
  }
}

const escapeHelpersStart = html.indexOf("function escHTML(value)");
const escapeHelpersEnd = html.indexOf("function save()", escapeHelpersStart);
assert.ok(escapeHelpersStart >= 0 && escapeHelpersEnd > escapeHelpersStart, "HTML escaping helpers must be defined before the demo store functions");
const escapeHelpers = html.slice(escapeHelpersStart, escapeHelpersEnd);
const { escHTML, jsArg } = new Function(escapeHelpers + "; return { escHTML, jsArg };")();
const xssProbe = "x');alert(1);//<img src=x onerror=alert(1)> \" &";
const encodedJsArg = jsArg(xssProbe);
const htmlEntities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '\"', "&#39;": "'" };
const decodedJsArg = encodedJsArg.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => htmlEntities[entity]);
assert.equal(JSON.parse(decodedJsArg), xssProbe, "Inline event arguments must remain valid JSON string literals for hostile record IDs");
assert.ok(!/[<>\"']/.test(encodedJsArg), "Inline event arguments must be HTML-attribute escaped");
assert.equal(escHTML("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;", "User-provided text must be escaped before HTML insertion");

const mainRenderStart = html.indexOf("function render(){");
const mainRenderEnd = html.indexOf("function empty()", mainRenderStart);
assert.ok(mainRenderStart >= 0 && mainRenderEnd > mainRenderStart, "Main fleet renderer is missing");
const mainRender = html.slice(mainRenderStart, mainRenderEnd);
for (const escapedValue of [
  "escHTML(x.insurance||'—')",
  "escHTML(x.license||'—')",
  "escHTML(x.status||'نشطة')",
  "escHTML(x.day||'—')",
  "escHTML(x.liters??0)",
  "escHTML(x.next_date||'—')",
  "escHTML(a.msg)",
  "escHTML(v.id)",
  "escHTML(v.plate)",
]) {
  assert.ok(mainRender.includes(escapedValue), "Main renderer must escape dynamic HTML value: " + escapedValue);
}
assert.ok(mainRender.includes("jsArg(x.id)") && !mainRender.includes("'${x.id}'"), "Main table actions must encode record IDs as safe JavaScript arguments");
assert.equal(mainRender.includes("${x.day}"), false, "All operational dates in the main renderer must be escaped");
assert.ok(html.includes("escHTML(x.last)") && html.includes("escHTML(x.date)"), "Fleet insights and expiry reports must escape stored dates");
assert.ok(html.includes('href="${escHTML(data.signedUrl)}"'), "Driver invoice signed URLs must be escaped for HTML attributes");
const modalStart = html.indexOf("function openModal(");
const modalEnd = html.indexOf("function closeModal()", modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart, "Record modal renderer is missing");
const modalSource = html.slice(modalStart, modalEnd);
assert.ok(modalSource.includes("escHTML(record?.[key]??'')") && modalSource.includes("escHTML(v.id)") && modalSource.includes("escHTML(v.plate)") && modalSource.includes("escHTML(d.id)") && modalSource.includes("escHTML(d.name)"), "Record modal must escape editable values and select option values/labels");
assert.ok(html.includes('onclick="printVehicleHistory(${jsArg(id)})"') && html.includes('onclick="exportSingleDriverCSV(${jsArg(id)})"') && html.includes('onclick="printSingleDriverHistory(${jsArg(id)})"'), "History actions must encode record IDs as safe JavaScript arguments");
assert.ok(html.includes('href="${escHTML(sd.signedUrl)}"'), "Invoice signed URLs must be escaped for HTML attributes");
assert.ok(html.includes('onclick="setFleetIncidentStatus(${jsArg(x.id)})"') && html.includes('onclick="deleteFleetIncident(${jsArg(x.id)})"'), "Incident actions must encode locally stored IDs as safe JavaScript arguments");
const cacheGuardStart = html.indexOf("function hasCloudScopedRows(data)");
const cacheGuardEnd = html.indexOf("function money(n)", cacheGuardStart);
assert.ok(cacheGuardStart >= 0 && cacheGuardEnd > cacheGuardStart, "Cloud-cache detection and local-data loader are missing");
const cacheGuardSource = html.slice(cacheGuardStart, cacheGuardEnd);
const { hasCloudScopedRows } = new Function(cacheGuardSource + "; return { hasCloudScopedRows };")();
assert.equal(
  hasCloudScopedRows({ vehicles: [{ id: "v1" }], drivers: [], fuel: [], maintenance: [], trips: [] }),
  false,
  "Local-only fleet records must remain in the local demo store",
);
assert.equal(
  hasCloudScopedRows({ vehicles: [{ id: "v1", company_id: "company-1" }], drivers: [], fuel: [], maintenance: [], trips: [] }),
  true,
  "Previously cached company-scoped cloud records must be detected for cleanup",
);
const cloudSaveStart = html.indexOf("const oldSave=save;");
const cloudSaveEnd = html.indexOf("const oldRender=render;", cloudSaveStart);
assert.ok(cloudSaveStart >= 0 && cloudSaveEnd > cloudSaveStart, "Cloud save wrapper is missing");
const cloudSaveSource = html.slice(cloudSaveStart, cloudSaveEnd);
assert.ok(
  cloudSaveSource.includes("if(suppressLocalSave||cloudMode)return;oldSave();") &&
    !cloudSaveSource.includes("localStorage.setItem('asatuli_demo'"),
  "Cloud-mode renders and saves must not persist company records to the local demo key",
);
const logoutStart = html.indexOf("async function logoutCloud()");
const logoutEnd = html.indexOf("async function switchCompany()", logoutStart);
assert.ok(logoutStart >= 0 && logoutEnd > logoutStart, "Cloud logout function is missing");
const logoutSource = html.slice(logoutStart, logoutEnd);
assert.ok(
  logoutSource.includes("if(!cloudMode&&!sb)") &&
    logoutSource.includes("const {error}=await sb.auth.signOut();if(error)throw error;") &&
    logoutSource.includes("window.startAsatuliRealtimeSync?.()"),
  "Cloud logout must be explicit and must not clear data when Supabase sign-out fails",
);
assert.ok(
  logoutSource.includes("localStorage.removeItem('asatuli_active_company')") &&
    logoutSource.includes("for(const key of ['vehicles','drivers','fuel','maintenance','trips'])store[key]=[]") &&
    logoutSource.includes("suppressLocalSave=true") &&
    logoutSource.includes("finally{suppressLocalSave=false;}"),
  "Cloud logout must clear active-company state and in-memory company records without overwriting local-only data",
);
assert.ok(
  !logoutSource.includes("localStorage.removeItem('asatuli_demo')"),
  "Cloud logout must not delete a user's separate local-only demo records",
);


const tripUiStart = html.indexOf("const tripFormFieldIds=");
const tripUiEnd = html.indexOf("function showDriverView(", tripUiStart);
assert.ok(tripUiStart >= 0 && tripUiEnd > tripUiStart, "Driver trip submission state block is missing");
const tripUiSource = html.slice(tripUiStart, tripUiEnd);
assert.ok(
  tripUiSource.includes("function tripDraftSnapshot(fields)") &&
    tripUiSource.includes("let pendingTripSnapshot='';") &&
    html.includes("pendingTripSnapshot=tripDraftSnapshot(tripFormFields);"),
  "A fresh idempotency key must capture the current draft fingerprint in memory",
);
assert.ok(
  !tripUiSource.includes("tripFormFields.forEach(field=>['input','change']"),
  "Editing a trip form must not reset the pending idempotency key",
);
assert.ok(
  tripUiSource.includes("pendingTripSnapshot='';") &&
    tripUiSource.includes("localStorage.removeItem(pendingTripStorageKey)"),
  "A pending key and its in-memory draft fingerprint must be reset together after a confirmed outcome",
);
const tripSnapshotStart = tripUiSource.indexOf("function tripDraftSnapshot(fields)");
const tripSnapshotEnd = tripUiSource.indexOf("const pendingTripStorageKey", tripSnapshotStart);
assert.ok(tripSnapshotStart >= 0 && tripSnapshotEnd > tripSnapshotStart, "Trip draft snapshot helper is missing");
const tripSnapshotSource = tripUiSource.slice(tripSnapshotStart, tripSnapshotEnd);
const { tripDraftSnapshot } = new Function(tripSnapshotSource + "; return { tripDraftSnapshot };")();
const tripDraftFields = [
  { id: "dpTripDest", value: "عمّان" },
  { id: "dpTripInvoices", type: "file", files: [{ name: "invoice.pdf", size: 512, lastModified: 10, type: "application/pdf" }] },
];
const initialTripSnapshot = tripDraftSnapshot(tripDraftFields);
tripDraftFields[0].value = "الزرقاء";
assert.notEqual(
  tripDraftSnapshot(tripDraftFields),
  initialTripSnapshot,
  "Changing trip details after an ambiguous save must be detectable",
);
tripDraftFields[0].value = "عمّان";
tripDraftFields[1].files[0].name = "replacement.pdf";
assert.notEqual(
  tripDraftSnapshot(tripDraftFields),
  initialTripSnapshot,
  "Replacing an invoice attachment must be detectable as a changed draft",
);
const tripSaveHandlerStart = html.indexOf("document.getElementById('dpTripSave').onclick=async()=>");
const duplicateBranchStart = html.indexOf("if(result.duplicate){", tripSaveHandlerStart);
const duplicateEarlyReturn = html.indexOf("return;", duplicateBranchStart);
const duplicateFieldClear = html.indexOf("['dpTripDest','dpTripKm'", duplicateBranchStart);
assert.ok(
  tripSaveHandlerStart >= 0 && duplicateBranchStart > tripSaveHandlerStart &&
    duplicateEarlyReturn > duplicateBranchStart && duplicateEarlyReturn < duplicateFieldClear,
  "When an earlier attempt is confirmed as saved but the current draft changed, the form must be preserved before the reset path",
);

const realtimeOptLoaderStart = html.indexOf("async function loadCloud(targetTable=null)");
const realtimeOptLoaderEnd = html.indexOf("const oldSave", realtimeOptLoaderStart);
assert.ok(realtimeOptLoaderStart >= 0 && realtimeOptLoaderEnd > realtimeOptLoaderStart, "Cloud loader must support table-scoped refresh");
const realtimeOptLoaderSource = html.slice(realtimeOptLoaderStart, realtimeOptLoaderEnd);
assert.ok(
  realtimeOptLoaderSource.includes("const selected=targetTable?[targetTable]:Object.keys(tables)") &&
    realtimeOptLoaderSource.includes("selected.some(k=>!Object.prototype.hasOwnProperty.call(tables,k))"),
  "Cloud loader must refresh a validated selected table or all core tables",
);
const realtimeOptSyncStart = html.indexOf('<script id="asatuli-realtime-sync-v1">');
const realtimeOptSyncEnd = html.indexOf("</script>", realtimeOptSyncStart);
assert.ok(realtimeOptSyncStart >= 0 && realtimeOptSyncEnd > realtimeOptSyncStart, "Realtime sync handler is missing");
const realtimeOptSyncSource = html.slice(realtimeOptSyncStart, realtimeOptSyncEnd);
assert.ok(
  realtimeOptSyncSource.includes("coreTables.has(table)?table:null") &&
    realtimeOptSyncSource.includes("loadCloud(targetTable)"),
  "Realtime changes to core fleet tables should reload only the affected table",
);
assert.ok(
  realtimeOptSyncSource.includes("if(table&&coreTables.has(table))pendingCoreTables.add(table)") &&
    realtimeOptSyncSource.includes("else pendingFullRefresh=true") &&
    realtimeOptSyncSource.includes("if(pendingFullRefresh)") &&
    realtimeOptSyncSource.includes("pendingCoreTables.clear()"),
  "Debounced Realtime events must retain every affected core table and let auxiliary-table full refreshes take priority",
);
assert.ok(
  realtimeOptSyncSource.includes("const queued=refreshQueued?[null]:[...queuedCoreTables]"),
  "A queued auxiliary-table event must not be lost when core-table events are also queued during a refresh",
);

const reportExportStart = html.indexOf("function exportReport(){");
const reportExportEnd = html.indexOf("function exportDriverReportCSV()", reportExportStart);
assert.ok(reportExportStart >= 0 && reportExportEnd > reportExportStart, "Report export function is missing");
const reportExportSource = html.slice(reportExportStart, reportExportEnd);
assert.ok(
  reportExportSource.includes(".join('\\n')") &&
    reportExportSource.includes("تقرير\\nالفترة:") &&
    !reportExportSource.includes("\\\\n"),
  "Text report export must contain real newline escapes, not literal backslash-n sequences",
);
assert.ok(
  html.includes("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2"),
  "Browser Supabase SDK must use an explicitly pinned release",
);

const invoiceReview = html.match(
  /<script id="owner-trip-invoice-review">([\s\S]*?)<\/script>/i,
)?.[1] ?? "";

assert.ok(invoiceReview, "Owner invoice review script is missing");
assert.ok(invoiceReview.includes("sb.rpc('is_company_owner'"), "Invoice review must verify company ownership");
assert.ok(invoiceReview.includes("isOwner!==true"), "Invoice review must stop for non-owners");

const saveStart = html.indexOf("document.getElementById('dpTripSave').onclick=async()=>");
const saveEnd = html.indexOf("document.getElementById('dpLogout').onclick", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "Driver trip save handler is missing");
const saveHandler = html.slice(saveStart, saveEnd);

assert.ok(
  saveHandler.includes("/functions/v1/driver-save-trip-with-invoices"),
  "Driver trip and invoice writes must use the server-side upload function",
);
assert.ok(saveHandler.includes("new FormData()"), "Driver upload must submit multipart form data");
assert.ok(saveHandler.includes("submission_id"), "Driver upload must send a stable idempotency key");
assert.ok(saveHandler.includes("crypto.randomUUID()"), "Driver upload must use a cryptographically random submission key");
assert.ok(saveHandler.includes("localStorage"), "Pending submission key must survive a page refresh");
assert.ok(saveHandler.includes("tripSubmitButton.disabled=true"), "Driver trip save must lock while a request is in progress");
assert.ok(saveHandler.includes("files.length>5"), "Client-side five-file limit is missing");
assert.ok(saveHandler.includes("8*1024*1024"), "Client-side invoice size guard is missing");
assert.ok(
  !saveHandler.includes(".storage.from('trip-invoices').upload"),
  "Driver portal must not upload invoice files directly from the browser",
);

assert.ok(uploadFunction.includes("auth.getUser(token)"), "Upload function must validate the authenticated user");
assert.ok(uploadFunction.includes('.from("members")'), "Upload function must verify company membership");
assert.ok(uploadFunction.includes('.from("drivers")'), "Upload function must require a linked driver");
assert.ok(
  uploadFunction.includes('.from("employee_vehicle_assignments")'),
  "Upload function must verify the assigned vehicle",
);
assert.ok(uploadFunction.includes("readBoundedFormData"), "Upload function must bound request bytes");
assert.ok(uploadFunction.includes("MAX_INVOICE_SIZE"), "Upload function must enforce the per-file size limit");
assert.ok(uploadFunction.includes("detectInvoiceType(bytes)"), "Upload function must inspect actual file signatures");
assert.ok(
  uploadFunction.includes('admin.storage') && uploadFunction.includes('.upload(path, bytes'),
  "Upload function must upload verified bytes to private Storage",
);
assert.ok(uploadFunction.includes('.from("trips").insert'), "Trip insert must run with the authenticated user and RLS");
assert.ok(uploadFunction.includes("cleanupUploads"), "Failed trip saves must clean up uploaded files");
assert.ok(uploadFunction.includes('requiredText(form, "submission_id", 36)'), "Server must require a valid client submission id");
assert.ok(uploadFunction.includes('.eq("submission_id", submissionId)'), "Server must return the previously saved trip for a retried submission");
assert.ok(uploadFunction.includes('tripError.code === "23505"'), "Server must recover safely from concurrent duplicate submissions");
assert.ok(
  tripSubmissionIdempotencyMigration.includes("ADD COLUMN IF NOT EXISTS submission_id uuid") &&
    tripSubmissionIdempotencyMigration.includes("CREATE UNIQUE INDEX IF NOT EXISTS trips_company_driver_submission_unique") &&
    tripSubmissionIdempotencyMigration.includes("WHERE submission_id IS NOT NULL"),
  "Trip submission ids must have a nullable, company/driver-scoped unique index",
);

const moduleAccessScriptStart = html.indexOf('<script id="asatuli-module-access-ui">');
const moduleAccessScriptEnd = html.indexOf("</script>", moduleAccessScriptStart);
assert.ok(moduleAccessScriptStart >= 0 && moduleAccessScriptEnd > moduleAccessScriptStart, "Module permission enforcement script must be present");
const moduleAccessSource = html.slice(moduleAccessScriptStart, moduleAccessScriptEnd);
assert.ok(
  moduleAccessSource.includes("const originalDelete=window.del") &&
    moduleAccessSource.includes("if(!can(moduleName,'delete'))") &&
    moduleAccessSource.includes("return originalDelete.apply(this,arguments)") &&
    !moduleAccessSource.includes(".from(moduleName).delete()"),
  "Module permission enforcement must delegate deletion to the version-checked handler rather than bypass optimistic locking",
);

const optimisticTables = ["vehicles", "drivers", "fuel", "maintenance", "trips"];
assert.ok(
  (fleetOptimisticLockMigration.match(/ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/g) || []).length === optimisticTables.length &&
    optimisticTables.every((table) => fleetOptimisticLockMigration.includes(`public.${table}`)) &&
    fleetOptimisticLockMigration.includes("BEFORE UPDATE ON public.%I") &&
    fleetOptimisticLockMigration.includes("NEW.updated_at := clock_timestamp()"),
  "All core fleet tables must receive a non-null version timestamp maintained automatically on update",
);
assert.ok(
  html.includes("editingUpdatedAt=record?.updated_at??null") &&
    html.includes(".eq('updated_at',expectedUpdatedAt)") &&
    html.includes("latestRow.updated_at!==expectedUpdatedAt"),
  "Cloud record edits must compare the version captured when the modal opened and detect stale writes",
);
assert.ok(
  html.includes(".delete().eq('id',id).eq('company_id',companyId).eq('updated_at',current.updated_at)") &&
    html.includes("latestRow.updated_at!==current.updated_at"),
  "Cloud record deletes must compare the cached version and refuse to remove a record changed by another user",
);
assert.ok(
  html.includes("احتفظنا بتعديلاتك الحالية") &&
    html.includes("حدّث الصفحة وافتح السجل مجدداً"),
  "Stale edit attempts must preserve the open form and explain how to refresh the latest record",
);

assert.equal(MAX_INVOICE_SIZE, 8 * 1024 * 1024, "Server invoice file limit must remain 8 MiB");
assert.equal(MAX_INVOICE_COUNT, 5, "Server invoice count limit must remain five");
assert.deepEqual(
  detectInvoiceType(new TextEncoder().encode("%PDF-1.7")),
  { mime: "application/pdf", extension: "pdf" },
  "PDF signature should be recognized",
);
assert.deepEqual(
  detectInvoiceType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  { mime: "image/png", extension: "png" },
  "PNG signature should be recognized",
);
assert.deepEqual(
  detectInvoiceType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])),
  { mime: "image/jpeg", extension: "jpg" },
  "JPEG signature should be recognized",
);
assert.equal(
  detectInvoiceType(new TextEncoder().encode("<svg onload=alert(1)>")),
  null,
  "SVG/HTML-like content must not be accepted as an image",
);
assert.equal(
  detectInvoiceType(new Uint8Array([0x00, 0x01, 0x02, 0x03])),
  null,
  "Unknown file signatures must be rejected",
);

assert.ok(
  html.includes("roleq.error||roleq.data?.role!=='driver'"),
  "Driver portal must only render for a dedicated driver role",
);
assert.ok(
  html.includes("r.role==='driver'?'':'<button"),
  "Driver accounts must not be offered module-permission controls",
);
assert.ok(
  driverAccountFunction.includes('role: "driver"'),
  "New driver accounts must use the dedicated driver role",
);
assert.ok(
  uploadFunction.includes('(membership as unknown as { role: string }).role !== "driver"'),
  "Server-side trip uploads must require the dedicated driver role",
);
assert.ok(
  driverRoleMigration.includes("'driver'::text"),
  "Database membership constraint must allow the dedicated driver role",
);
assert.ok(
  driverRoleMigration.includes("set role = 'driver'"),
  "Existing linked driver memberships must be converted",
);
assert.ok(
  driverRoleMigration.includes("delete from public.member_permissions"),
  "Linked driver accounts must have module grants removed",
);
assert.ok(
  driverRoleMigration.includes("m.role = 'driver'"),
  "Trip invoice storage uploads must require the dedicated driver role",
);
assert.ok(
  driverApprovalRepair.includes("VALUES (v_company, p_user_id, 'driver')"),
  "Approved employee join requests must receive the dedicated driver role",
);
assert.ok(
  driverApprovalRepair.includes("DO UPDATE SET role = 'driver'"),
  "Re-approved viewer accounts must be converted to dedicated drivers",
);
assert.ok(
  driverApprovalRepair.includes("DELETE FROM public.member_permissions"),
  "Approved drivers must not keep stale manager/viewer module grants",
);
assert.ok(
  driverApprovalRepair.includes("role IN ('owner', 'manager')"),
  "Employee approval must never downgrade an owner or manager to a driver",
);
assert.ok(
  driverApprovalMigration.includes("CREATE UNIQUE INDEX IF NOT EXISTS drivers_company_user_id_unique"),
  "Linked driver identity uniqueness must remain enforced",
);
assert.ok(
  duplicateDriverIndexCleanupMigration.includes("DROP INDEX IF EXISTS public.drivers_company_user_id_unique") &&
    duplicateDriverIndexCleanupMigration.includes("drivers_company_user_unique"),
  "Duplicate linked-driver index cleanup must preserve the original unique index",
);
assert.ok(
  html.includes("['loaded_meters','الأمتار المحملة','number']") &&
    html.includes("<th>الأمتار المحملة</th>") &&
    html.includes("Number(x.loaded_meters||0)"),
  "Loaded meters must be editable, visible in trip records, and included in reporting",
);
const monthlyReportStart = html.indexOf("function renderMonthlyReport(){");
const monthlyReportEnd = html.indexOf("function exportDriverReportCSV", monthlyReportStart);
assert.ok(monthlyReportStart >= 0 && monthlyReportEnd > monthlyReportStart, "Monthly report function is missing");
const monthlyReportSource = html.slice(monthlyReportStart, monthlyReportEnd);
const driverHistoryStart = html.indexOf("async function driverHistory(id)");
const driverHistoryEnd = html.indexOf("function printSingleDriverHistory(id)", driverHistoryStart);
const driverHistorySource = html.slice(driverHistoryStart, driverHistoryEnd);
assert.ok(
  driverHistoryStart >= 0 && driverHistoryEnd > driverHistoryStart &&
    driverHistorySource.includes("loadedMeters=trips.reduce") &&
    driverHistorySource.includes("الأمتار المحمّلة") &&
    driverHistorySource.includes("x.loaded_meters"),
  "Individual driver history must total and show loaded meters per trip",
);
const driverPrintStart = html.indexOf("function printSingleDriverHistory(id)");
const driverPrintEnd = html.indexOf("function exportSingleDriverCSV(id)", driverPrintStart);
const driverPrintSource = html.slice(driverPrintStart, driverPrintEnd);
assert.ok(
  driverPrintSource.includes("loadedMeters=trips.reduce") &&
    driverPrintSource.includes("x.loaded_meters") &&
    driverPrintSource.includes("الأمتار المحمّلة"),
  "Printable individual driver statement must include loaded meters in its summary and rows",
);
const driverCsvStart = html.indexOf("function exportSingleDriverCSV(id)");
const driverCsvEnd = html.indexOf("async function openMembers()", driverCsvStart);
const driverCsvSource = html.slice(driverCsvStart, driverCsvEnd);
assert.ok(
  driverCsvSource.includes("الأمتار المحمّلة") &&
    driverCsvSource.includes("Number(x.loaded_meters||0)"),
  "Individual driver CSV export must include loaded meters",
);

assert.ok(
  monthlyReportSource.includes("const vehicleRows=") &&
    monthlyReportSource.includes("${vehicleRows||") &&
    monthlyReportSource.includes("loadedMeters.toLocaleString"),
  "Monthly report must build its vehicle rows and loaded-meter totals before rendering",
);
assert.ok(
  html.includes("data[key]=value") &&
    html.includes("value<0") &&
    html.includes("table==='trips'&&data.km<=0"),
  "Fleet record forms must reject invalid or negative operational numbers",
);
const cloudLoaderStart = html.indexOf("async function loadCloud(targetTable=null)");
const cloudLoaderEnd = html.indexOf("const oldSave=save", cloudLoaderStart);
assert.ok(cloudLoaderStart >= 0 && cloudLoaderEnd > cloudLoaderStart, "Cloud data loader is missing");
const cloudLoaderSource = html.slice(cloudLoaderStart, cloudLoaderEnd);
assert.ok(
  cloudLoaderSource.includes(".order('id',{ascending:true})") &&
    cloudLoaderSource.includes(".range(from,from+pageSize-1)") &&
    cloudLoaderSource.includes("if(page.length<pageSize)break"),
  "Cloud data loading must paginate all operational records in stable batches",
);
assert.ok(
  !driverApprovalRepair.includes("VALUES (v_company, p_user_id, 'viewer')"),
  "Employee approval must not create a generic viewer instead of a driver",
);
assert.ok(
  driverRoleMigration.includes("d.id = trips.driver_id"),
  "Drivers must only read their own trip rows",
);

assert.ok(
  driverAccountFunction.includes('req.method !== "POST"') &&
    driverAccountFunction.includes("readBoundedJson(req)") &&
    driverAccountFunction.includes("MAX_REQUEST_SIZE = 16 * 1024"),
  "Driver account creation must reject unsupported methods and bound JSON request bodies",
);
assert.ok(
  driverAccountFunction.includes("auth.getUser()") &&
    driverAccountFunction.includes('rpc("is_company_owner"') &&
    driverAccountFunction.includes("UUID_RE.test(vehicle_id)") &&
    driverAccountFunction.includes("phoneDigits.length < 8"),
  "Driver account creation must verify the signed-in owner and validate the account inputs",
);
assert.ok(
  edgeConfig.includes("[functions.owner-create-driver]") &&
    edgeConfig.includes("[functions.driver-save-trip-with-invoices]") &&
    (edgeConfig.match(/verify_jwt = true/g) || []).length === 2,
  "Both authenticated Edge Functions must require platform JWT verification",
);

for (const unusedRpc of [
  "can_manage_company(uuid)",
  "employee_request_join(text, text)",
  "employee_submit_join_request(text, text)",
  "owner_add_member(uuid, uuid, text)",
  "owner_approve_employee(uuid, uuid)",
]) {
  assert.ok(
    unusedRpcRevocationMigration.includes("REVOKE ALL ON FUNCTION public." + unusedRpc),
    "Unused legacy RPC execution must remain revoked: " + unusedRpc,
  );
}

assert.ok(
  createCompanyRpcRevocationMigration.includes(
    "REVOKE ALL ON FUNCTION public.create_company(text) FROM PUBLIC, anon, authenticated",
  ),
  "Tenant creation RPC must not be directly executable by public or signed-in API roles",
);
assert.ok(
  !html.includes("create_company"),
  "The active client must not expose or call the retired tenant-creation RPC",
);

assert.ok(
  removedMemberAccessMigration.includes("JOIN public.members AS m"),
  "Assigned-vehicle access must require current company membership",
);
assert.ok(
  removedMemberAccessMigration.includes("DELETE FROM public.employee_vehicle_assignments") &&
    removedMemberAccessMigration.includes("UPDATE public.drivers") &&
    removedMemberAccessMigration.includes("SET user_id = NULL"),
  "Removing a member must revoke their assignments and detach their driver login",
);
assert.ok(
  removedMemberAccessMigration.includes("CREATE POLICY trip_invoice_read_company") &&
    removedMemberAccessMigration.includes("m.user_id = (SELECT auth.uid())"),
  "Trip invoice reads must be restricted to current company members",
);

assert.ok(policy.includes("CREATE POLICY trip_invoice_upload_assigned_driver"), "Assigned-driver upload policy is missing");
assert.ok(policy.includes("TO authenticated"), "Invoice uploads must require an authenticated user");
assert.ok(policy.includes("employee_assigned_vehicle"), "Invoice uploads must require an assigned vehicle");
assert.ok(policy.includes("FROM public.drivers AS d"), "Invoice uploads must require a linked driver row");
assert.ok(policy.includes("m.role = 'driver'"), "Invoice uploads must require a dedicated driver membership");
assert.ok(policy.includes("(storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text"), "Invoice uploads must be scoped to the uploader folder");
assert.ok(policy.includes("d.company_id = ((storage.foldername(storage.objects.name))[1])::uuid"), "Driver-company check must use the uploaded object path");
assert.ok(!policy.includes("storage.foldername(d.name)"), "Driver-company check must not parse the driver name as a storage path");

assert.ok(html.includes(`onsubmit="event.preventDefault();window.connectAndAuth('login')"`), "Login form must call the explicit global login handler");
assert.ok(html.includes("window.connectAndAuth=connectAndAuth;"), "Login handler must be exported before recovery routing");
assert.ok(html.includes("window.asatuliRouteByMembership=routeByMembership;"), "Role router must be explicitly exposed");
assert.ok(html.includes("role==='owner'||role==='manager'||role==='viewer'"), "Owner/manager/viewer roles must route to the manager interface");
assert.ok(html.includes("else if(role==='driver')"), "Driver role must remain routed to the dedicated driver portal");
assert.ok(html.includes('id="asatuli-session-bootstrap"'), "Saved Supabase sessions must be restored on page load");


const loginFlowStart = html.indexOf("async function connectAndAuth(mode)");
const loginFlowEnd = html.indexOf("window.connectAndAuth=connectAndAuth;", loginFlowStart);
assert.ok(loginFlowStart >= 0 && loginFlowEnd > loginFlowStart, "Login flow source is missing");
const loginFlow = html.slice(loginFlowStart, loginFlowEnd);
assert.ok(
  loginFlow.includes("await loadCloud();") &&
    loginFlow.includes("document.body.classList.remove('auth-gate');") &&
    loginFlow.includes("closeConnect();") &&
    loginFlow.includes("await window.asatuliRouteByMembership();"),
  "Successful sign-in must reveal the app after data load and explicitly route by membership",
);
assert.ok(
  !loginFlow.includes("await window.initAsatuliDriverPortal?.();"),
  "Login must not initialize the driver portal for every account",
);
assert.ok(
  loginFlow.includes("await sb.rpc('accept_member_invites')") &&
    loginFlow.includes("if(!members?.length)") &&
    loginFlow.includes("لم يتم إنشاء شركة جديدة."),
  "Login must accept valid invitations but reject accounts without a company membership instead of creating a company automatically",
);
assert.ok(
  !loginFlow.includes("create_company") &&
    !loginFlow.includes("auth.signUp") &&
    !loginFlow.includes("asatuli_pending_company"),
  "The login route must not expose signup or automatic company creation",
);
assert.ok(
  !html.includes('id="companyName"'),
  "The login page must not carry a hidden company name used by an implicit signup path",
);

const resumeFlowStart = html.indexOf("async function resumeCloudSession()");
const resumeFlowEnd = html.indexOf("async function logoutCloud()", resumeFlowStart);
assert.ok(resumeFlowStart >= 0 && resumeFlowEnd > resumeFlowStart, "Saved-session restore flow is missing");
const resumeFlow = html.slice(resumeFlowStart, resumeFlowEnd);
assert.ok(
  resumeFlow.includes("await window.asatuliRouteByMembership();") &&
    resumeFlow.includes("document.body.classList.remove('auth-gate')"),
  "Restored sessions must reveal the app and route by active membership",
);
const routeStart = html.indexOf("async function routeByMembership()");
const routeEnd = html.indexOf("const originalConnect=window.connectAndAuth", routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, "Membership router source is missing");
const routeSource = html.slice(routeStart, routeEnd);
assert.ok(
  routeSource.includes(".select('company_id,role')") &&
    routeSource.includes(".eq('user_id',user.id)") &&
    routeSource.includes("localStorage.setItem('asatuli_active_company',companyId)"),
  "Membership routing must resolve the signed-in user's current company and role",
);



const modulePermissionMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127191510_align_fuel_maintenance_trip_rls_with_module_permissions.sql"),
  "utf8",
);
const moduleAccessUi = html.match(/<script id="asatuli-module-access-ui">([\s\S]*?)<\/script>/i)?.[1] ?? "";
assert.ok(moduleAccessUi, "Module access UI enforcement script is missing");
assert.ok(
  moduleAccessUi.includes("member_permissions") &&
    moduleAccessUi.includes("can(moduleName,'delete')") &&
    moduleAccessUi.includes("can(moduleName,'add')") &&
    moduleAccessUi.includes(".eq('company_id',companyId)") &&
    moduleAccessUi.includes("window.asatuliRouteByMembership"),
  "Manager/viewer module permissions must be loaded, applied to actions, and company-scoped",
);
for (const [table, actions] of [
  ["fuel", ["view", "add", "edit", "delete"]],
  ["maintenance", ["view", "add", "edit", "delete"]],
  ["trips", ["view", "add", "edit", "delete"]],
]) {
  for (const action of actions) {
    assert.ok(
      modulePermissionMigration.includes("public.has_module_permission(company_id, '" + table + "', '" + action + "')"),
      "RLS migration must enforce " + action + " permission on " + table,
    );
  }
}

const tripDriverReadMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127192533_restrict_trip_reads_to_linked_driver_or_module_permission.sql"),
  "utf8",
);
const tripReadPolicy = tripDriverReadMigration.slice(
  tripDriverReadMigration.indexOf("create policy module_read"),
);
assert.ok(
  tripReadPolicy.includes("m.role = 'driver'") &&
    tripReadPolicy.includes("d.user_id = (select auth.uid())") &&
    tripReadPolicy.includes("d.id = trips.driver_id") &&
    tripReadPolicy.includes("public.employee_assigned_vehicle(company_id, vehicle_id)") &&
    tripReadPolicy.includes("public.has_module_permission(company_id, 'trips', 'view')"),
  "Trip read access must be limited to the linked driver, company owner, or explicitly permitted module viewer",
);

const securityDefinerPathMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127193021_harden_security_definer_function_search_paths.sql"),
  "utf8",
);
const privilegedFunctions = [
  "accept_member_invites()",
  "create_company(text)",
  "employee_assigned_vehicle(uuid, uuid)",
  "has_module_permission(uuid, text, text)",
  "is_company_owner(uuid)",
  "my_companies()",
  "owner_invite_member(uuid, text, text)",
  "owner_remove_member(uuid, uuid)",
  "owner_set_member_permissions(uuid, uuid, jsonb)",
];
for (const signature of privilegedFunctions) {
  assert.ok(
    securityDefinerPathMigration.includes(
      "ALTER FUNCTION public." + signature + "\n  SET search_path = pg_catalog, public, pg_temp;",
    ),
    "SECURITY DEFINER function must put pg_catalog first and pg_temp last: " + signature,
  );
}

const operationalDataConstraintsMigration = readFileSync(
  resolve(root, "supabase/migrations/20261127193205_enforce_operational_data_integrity_checks.sql"),
  "utf8",
);
for (const requiredConstraint of [
  "CHECK (liters > 0)",
  "CHECK (km > 0)",
  "CHECK (loaded_meters >= 0)",
  "CHECK (revenue >= 0)",
  "CHECK (other_cost >= 0)",
  "CHECK (cost >= 0)",
  "CHECK (char_length(btrim(plate)) > 0)",
  "CHECK (char_length(btrim(name)) > 0)",
]) {
  assert.ok(
    operationalDataConstraintsMigration.includes(requiredConstraint),
    "Database migration must enforce operational input rule: " + requiredConstraint,
  );
}

console.log(
  "PASS: " + blocks.length +
  " JavaScript blocks compile; server authentication, assignment checks, bounded uploads, file signatures, cleanup and storage policy checks passed.",
);
