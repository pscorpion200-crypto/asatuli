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
assert.ok(blocks.length > 0, "No script blocks were found");

for (let index = 0; index < blocks.length; index += 1) {
  try {
    new Function(blocks[index][1]);
  } catch (error) {
    throw new Error("JavaScript block " + (index + 1) + " failed syntax validation: " + error.message);
  }
}

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
const cloudLoaderStart = html.indexOf("async function loadCloud(){");
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

console.log(
  "PASS: " + blocks.length +
  " JavaScript blocks compile; server authentication, assignment checks, bounded uploads, file signatures, cleanup and storage policy checks passed.",
);
