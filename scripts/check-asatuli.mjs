import { readFileSync } from "node:fs";
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

const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
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

assert.ok(policy.includes("CREATE POLICY trip_invoice_upload_assigned_driver"), "Assigned-driver upload policy is missing");
assert.ok(policy.includes("TO authenticated"), "Invoice uploads must require an authenticated user");
assert.ok(policy.includes("employee_assigned_vehicle"), "Invoice uploads must require an assigned vehicle");
assert.ok(policy.includes("FROM public.drivers d"), "Invoice uploads must require a linked driver row");
assert.ok(policy.includes("(storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text"), "Invoice uploads must be scoped to the uploader folder");

console.log(
  "PASS: " + blocks.length +
  " JavaScript blocks compile; server authentication, assignment checks, bounded uploads, file signatures, cleanup and storage policy checks passed.",
);
