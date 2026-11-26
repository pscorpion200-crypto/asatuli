import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "asatuli_plus.html"), "utf8");
const policy = readFileSync(
  resolve(root, "supabase/operations/restrict_trip_invoice_upload_to_assigned_driver.sql"),
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
  saveHandler.indexOf(".from('drivers')") >= 0 &&
    saveHandler.indexOf(".from('drivers')") < saveHandler.indexOf(".storage.from('trip-invoices').upload"),
  "Driver account linkage must be checked before invoice upload",
);
assert.ok(saveHandler.includes("path=companyId+'/'+uid+'/'+vehicle.id+'/'+tripId+'/"), "Invoice path must include company, user, vehicle and trip");
assert.ok(saveHandler.includes("8*1024*1024"), "Client-side invoice size guard is missing");
assert.ok(saveHandler.includes("application/pdf") && saveHandler.includes("f.type.startsWith('image/')"), "Client-side invoice MIME guard is missing");
assert.ok(saveHandler.includes(".storage.from('trip-invoices').remove(paths)"), "Failed uploads must attempt cleanup");

assert.ok(policy.includes("CREATE POLICY trip_invoice_upload_assigned_driver"), "Assigned-driver upload policy is missing");
assert.ok(policy.includes("TO authenticated"), "Invoice uploads must require an authenticated user");
assert.ok(policy.includes("employee_assigned_vehicle"), "Invoice uploads must require an assigned vehicle");
assert.ok(policy.includes("FROM public.drivers d"), "Invoice uploads must require a linked driver row");
assert.ok(policy.includes("(storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text"), "Invoice uploads must be scoped to the uploader folder");

console.log("PASS: " + blocks.length + " JavaScript blocks compile; invoice ownership, driver upload, cleanup and storage policy checks passed.");
