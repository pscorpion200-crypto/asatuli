import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let admin: any = null;
  let createdUserId: string | null = null;
  let createdDriverId: string | null = null;
  let linkedExistingDriver = false;
  let companyIdForRollback: string | null = null;

  const rollback = async () => {
    if (!admin || !createdUserId || !companyIdForRollback) return;
    try {
      await admin.from("employee_vehicle_assignments")
        .delete().eq("company_id", companyIdForRollback).eq("user_id", createdUserId);
      if (createdDriverId) {
        if (linkedExistingDriver) {
          await admin.from("drivers")
            .update({ user_id: null })
            .eq("id", createdDriverId)
            .eq("company_id", companyIdForRollback)
            .eq("user_id", createdUserId);
        } else {
          await admin.from("drivers")
            .delete()
            .eq("id", createdDriverId)
            .eq("company_id", companyIdForRollback)
            .eq("user_id", createdUserId);
        }
      }
      await admin.from("members")
        .delete().eq("company_id", companyIdForRollback).eq("user_id", createdUserId);
      await admin.auth.admin.deleteUser(createdUserId);
    } catch (cleanupError) {
      console.error("Driver account rollback failed", cleanupError);
    }
  };

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) throw new Error("Supabase environment is incomplete");

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "يلزم تسجيل دخول المدير" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "جلسة المدير غير صالحة" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const vehicle_id = typeof body.vehicle_id === "string" ? body.vehicle_id : "";
    const company_id = typeof body.company_id === "string" ? body.company_id : "";

    if (!full_name || !email || password.length < 8 || !vehicle_id || !company_id) {
      throw new Error("أكمل الاسم والبريد وكلمة مرور من 8 أحرف والسيارة");
    }

    const owner = await userClient.rpc("is_company_owner", {
      p_company_id: company_id,
    });
    if (owner.error || owner.data !== true) {
      return new Response(JSON.stringify({ error: "هذه العملية متاحة لمالك الشركة فقط" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    admin = createClient(url, service);
    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id, company_id")
      .eq("id", vehicle_id)
      .single();
    if (vehicleError || vehicle.company_id !== company_id) {
      throw new Error("السيارة غير صالحة لهذه الشركة");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone: phone || null },
    });
    if (createError) throw createError;

    createdUserId = created.user.id;
    companyIdForRollback = company_id;

    const { error: memberError } = await admin.from("members").insert({
      company_id,
      user_id: createdUserId,
      role: "viewer",
    });
    if (memberError) throw memberError;

    if (phone) {
      const { data: matches, error: matchError } = await admin
        .from("drivers")
        .select("id, user_id")
        .eq("company_id", company_id)
        .eq("phone", phone)
        .limit(2);
      if (matchError) throw matchError;
      if (matches.length > 1) {
        throw new Error("رقم الهاتف موجود في أكثر من سجل سائق؛ راجع السجلات أولاً");
      }

      if (matches.length === 1) {
        const match = matches[0];
        if (match.user_id && match.user_id !== createdUserId) {
          throw new Error("رقم الهاتف مرتبط بحساب سائق آخر");
        }
        if (!match.user_id) {
          const { data: linked, error: linkError } = await admin
            .from("drivers")
            .update({ user_id: createdUserId })
            .eq("id", match.id)
            .eq("company_id", company_id)
            .is("user_id", null)
            .select("id")
            .single();
          if (linkError) throw linkError;
          createdDriverId = linked.id;
          linkedExistingDriver = true;
        } else {
          createdDriverId = match.id;
          linkedExistingDriver = true;
        }
      }
    }

    if (!createdDriverId) {
      const { data: driver, error: driverError } = await admin
        .from("drivers")
        .insert({
          company_id,
          user_id: createdUserId,
          name: full_name,
          phone: phone || null,
        })
        .select("id")
        .single();
      if (driverError) throw driverError;
      createdDriverId = driver.id;
    }

    const { error: assignmentError } = await admin.from("employee_vehicle_assignments").insert({
      company_id,
      user_id: createdUserId,
      vehicle_id,
      assigned_by: user.id,
    });
    if (assignmentError) throw assignmentError;

    return new Response(JSON.stringify({
      ok: true,
      user_id: createdUserId,
      driver_id: createdDriverId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    await rollback();
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
