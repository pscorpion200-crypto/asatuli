import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detectInvoiceType,
  MAX_INVOICE_COUNT,
  MAX_INVOICE_SIZE,
} from "../_shared/invoice-file-validation.mjs";

const MB = 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_INVOICE_COUNT * MAX_INVOICE_SIZE + 2 * MB;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readBoundedFormData(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new HttpError(415, "صيغة الطلب غير مدعومة");
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_SIZE) {
    throw new HttpError(413, "حجم الطلب أكبر من الحد المسموح");
  }
  if (!req.body) throw new HttpError(400, "بيانات الطلب فارغة");

  const reader = req.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_SIZE) {
        await reader.cancel();
        throw new HttpError(413, "إجمالي حجم المرفقات أكبر من الحد المسموح");
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const boundedBody = new Response(new Blob(chunks), {
    headers: { "Content-Type": contentType },
  });
  return await boundedBody.formData();
}

function requiredText(form: FormData, name: string, maxLength: number): string {
  const value = form.get(name);
  if (typeof value !== "string") {
    throw new HttpError(400, "بيانات الرحلة غير مكتملة");
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new HttpError(400, "تحقق من حقول الرحلة");
  }
  return text;
}

function numericField(form: FormData, name: string, allowZero: boolean): number {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "تحقق من القيم الرقمية للرحلة");
  }
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    (allowZero ? number < 0 : number <= 0) ||
    number > 100_000_000
  ) {
    throw new HttpError(400, "إحدى القيم الرقمية خارج النطاق المسموح");
  }
  return number;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function cleanupUploads(admin: ReturnType<typeof createClient>, paths: string[]) {
  if (!paths.length) return;
  const { error } = await admin.storage.from("trip-invoices").remove(paths);
  if (error) console.error("Trip invoice rollback cleanup failed", error);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let admin: ReturnType<typeof createClient> | null = null;
  const uploadedPaths: string[] = [];

  try {
    const authorization = req.headers.get("authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) throw new HttpError(401, "يجب تسجيل الدخول أولاً");
    const token = tokenMatch[1].trim();

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      throw new HttpError(500, "إعدادات الخادم غير مكتملة");
    }

    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) throw new HttpError(401, "جلسة الدخول غير صالحة");

    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const form = await readBoundedFormData(req);
    const companyId = requiredText(form, "company_id", 64);
    const vehicleId = requiredText(form, "vehicle_id", 64);
    const day = requiredText(form, "day", 10);
    const destination = requiredText(form, "destination", 200);
    const km = numericField(form, "km", false);
    const revenue = numericField(form, "revenue", true);
    const otherCost = numericField(form, "other_cost", true);
    const loadedMeters = numericField(form, "loaded_meters", true);
    const submissionId = requiredText(form, "submission_id", 36);
    const notesValue = form.get("notes");
    const notes = typeof notesValue === "string" ? notesValue.trim() : "";
    if (notes.length > 2000) throw new HttpError(400, "الملاحظات أطول من الحد المسموح");
    if (!UUID_RE.test(companyId) || !UUID_RE.test(vehicleId) || !UUID_RE.test(submissionId) || !validDate(day)) {
      throw new HttpError(400, "معرّف الشركة أو المركبة أو التاريخ غير صحيح");
    }

    const fileEntries = form.getAll("files");
    if (fileEntries.length > MAX_INVOICE_COUNT) {
      throw new HttpError(400, "الحد الأقصى خمسة مرفقات للرحلة الواحدة");
    }
    const files = fileEntries.filter((entry): entry is File => entry instanceof File);
    if (files.length !== fileEntries.length) {
      throw new HttpError(400, "أحد المرفقات غير صالح");
    }
    if (files.some((file) => file.size <= 0 || file.size > MAX_INVOICE_SIZE)) {
      throw new HttpError(400, "حجم كل فاتورة يجب أن يكون أقل من أو يساوي 8 ميغابايت");
    }

    const { data: membership, error: memberError } = await admin
      .from("members")
      .select("user_id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) throw new HttpError(500, "تعذر التحقق من عضوية الشركة");
    if (!membership) throw new HttpError(403, "حسابك غير مرتبط بهذه الشركة");
    if ((membership as unknown as { role: string }).role !== "driver") {
      throw new HttpError(403, "هذه العملية متاحة لحساب السائق فقط");
    }

    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", vehicleId)
      .maybeSingle();
    if (vehicleError) throw new HttpError(500, "تعذر التحقق من المركبة");
    if (!vehicle) throw new HttpError(403, "المركبة غير تابعة لهذه الشركة");

    const { data: drivers, error: driverError } = await admin
      .from("drivers")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .limit(2);
    if (driverError) throw new HttpError(500, "تعذر التحقق من سجل السائق");
    const driverId = (drivers as unknown as Array<{ id: string }> | null)?.[0]?.id;
    if (!drivers || drivers.length !== 1 || !driverId) {
      throw new HttpError(403, "حساب السائق غير مربوط بسجل سائق واحد في الشركة");
    }

    const { data: assignments, error: assignmentError } = await admin
      .from("employee_vehicle_assignments")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .eq("vehicle_id", vehicleId)
      .limit(2);
    if (assignmentError) throw new HttpError(500, "تعذر التحقق من تخصيص المركبة");
    if (!assignments || assignments.length !== 1) {
      throw new HttpError(403, "هذه المركبة غير مخصصة لحساب السائق");
    }

    // Return the first successful result when the same client submission is retried.
    const { data: existingTrip, error: existingTripError } = await admin
      .from("trips")
      .select("id, attachments")
      .eq("company_id", companyId)
      .eq("driver_id", driverId)
      .eq("submission_id", submissionId)
      .maybeSingle();
    if (existingTripError) {
      throw new HttpError(500, "تعذر التحقق من حالة إرسال الرحلة");
    }
    const priorTrip = existingTrip as unknown as { id: string; attachments: string[] } | null;
    if (priorTrip) {
      return jsonResponse({
        ok: true,
        trip_id: priorTrip.id,
        attachment_count: Array.isArray(priorTrip.attachments) ? priorTrip.attachments.length : 0,
        duplicate: true,
      });
    }

    const tripId = crypto.randomUUID();
    for (let index = 0; index < files.length; index += 1) {
      const bytes = new Uint8Array(await files[index].arrayBuffer());
      const detected = detectInvoiceType(bytes);
      if (!detected) {
        throw new HttpError(415, "المرفق يجب أن يكون صورة PNG أو JPG أو WEBP أو GIF أو ملف PDF صحيح");
      }

      const path =
        companyId + "/" + user.id + "/" + vehicleId + "/" + tripId + "/" +
        index + "-" + crypto.randomUUID() + "." + detected.extension;

      const { error: uploadError } = await admin.storage
        .from("trip-invoices")
        .upload(path, bytes, {
          contentType: detected.mime,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) {
        console.error("Trip invoice upload failed", uploadError);
        throw new HttpError(502, "تعذر رفع إحدى الفواتير");
      }
      uploadedPaths.push(path);
    }

    const { error: tripError } = await userClient.from("trips").insert({
      id: tripId,
      submission_id: submissionId,
      company_id: companyId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      day,
      km,
      revenue,
      other_cost: otherCost,
      loaded_meters: loadedMeters,
      destination,
      notes: notes || null,
      attachments: uploadedPaths,
    });
    if (tripError) {
      // A concurrent retry may pass the pre-check; the unique index is the final guard.
      if (tripError.code === "23505") {
        const { data: duplicateTrip, error: duplicateLookupError } = await admin
          .from("trips")
          .select("id, attachments")
          .eq("company_id", companyId)
          .eq("driver_id", driverId)
          .eq("submission_id", submissionId)
          .maybeSingle();

        const concurrentTrip = duplicateTrip as unknown as { id: string; attachments: string[] } | null;
        if (!duplicateLookupError && concurrentTrip) {
          await cleanupUploads(admin, uploadedPaths);
          uploadedPaths.length = 0;
          return jsonResponse({
            ok: true,
            trip_id: concurrentTrip.id,
            attachment_count: Array.isArray(concurrentTrip.attachments) ? concurrentTrip.attachments.length : 0,
            duplicate: true,
          });
        }
      }

      console.error("Driver trip insert rejected", tripError);
      throw new HttpError(
        tripError.code === "42501" ? 403 : 500,
        tripError.code === "42501"
          ? "لا تملك صلاحية تسجيل رحلة لهذه المركبة"
          : "تعذر حفظ الرحلة في قاعدة البيانات",
      );
    }

    return jsonResponse({ ok: true, trip_id: tripId, attachment_count: uploadedPaths.length });
  } catch (error) {
    if (admin) await cleanupUploads(admin, uploadedPaths);
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
    console.error("Driver trip save failed", error);
    return jsonResponse({ error: "حدث خطأ أثناء حفظ الرحلة؛ حاول مرة أخرى" }, 500);
  }
});
