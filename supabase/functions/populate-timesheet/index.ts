import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await anonClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
  }
  const userId = userData.user.id;

  // Service role client for DB operations
  const db = createClient(supabaseUrl, serviceRoleKey);

  // Look up employee
  const { data: employee, error: empError } = await db
    .from("employees")
    .select("id, name, employee_id_internal")
    .eq("user_id", userId)
    .single();

  if (empError || !employee) {
    return new Response(JSON.stringify({ error: "Employee record not found for authenticated user" }), { status: 404, headers });
  }

  // GET: discovery endpoint
  if (req.method === "GET") {
    const { data: codes } = await db
      .from("project_codes")
      .select("code, name, description")
      .eq("is_active", true)
      .order("code");

    return new Response(JSON.stringify({
      authenticated_as: { email: userData.user.email, user_id: userId },
      employee: { id: employee.id, name: employee.name, employee_id_internal: employee.employee_id_internal },
      project_codes: codes || [],
    }), { status: 200, headers });
  }

  // POST: upsert entries
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return new Response(JSON.stringify({ error: "entries must be a non-empty array" }), { status: 400, headers });
  }

  if (body.entries.length > 100) {
    return new Response(JSON.stringify({ error: "Maximum 100 entries per request" }), { status: 400, headers });
  }

  // Validate entries shape
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [i, e] of body.entries.entries()) {
    if (!e || typeof e !== "object") {
      return new Response(JSON.stringify({ error: `entries[${i}]: must be an object` }), { status: 400, headers });
    }
    if (!dateRe.test(e.date)) {
      return new Response(JSON.stringify({ error: `entries[${i}]: invalid date "${e.date}"` }), { status: 400, headers });
    }
    if (typeof e.project_code !== "string" || !e.project_code.trim()) {
      return new Response(JSON.stringify({ error: `entries[${i}]: project_code required` }), { status: 400, headers });
    }
    if (typeof e.hours !== "number" || e.hours <= 0 || e.hours > 24) {
      return new Response(JSON.stringify({ error: `entries[${i}]: hours must be 0 < h <= 24` }), { status: 400, headers });
    }
  }

  // Validate project codes
  const uniqueCodes = [...new Set(body.entries.map((e: any) => e.project_code.trim()))];
  const { data: activeCodes } = await db
    .from("project_codes")
    .select("code")
    .eq("is_active", true)
    .in("code", uniqueCodes);

  const activeSet = new Set((activeCodes || []).map((c: any) => c.code));
  const invalid = uniqueCodes.filter((c: string) => !activeSet.has(c));
  if (invalid.length > 0) {
    return new Response(JSON.stringify({ error: `Invalid/inactive project codes: ${invalid.join(", ")}` }), { status: 400, headers });
  }

  // Process entries
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of body.entries as any[]) {
    const entryDate = entry.date;
    const projectCode = entry.project_code.trim();
    const hoursWorked = entry.hours;
    const notes = entry.notes?.toString() || null;

    // Check existing
    const { data: existing } = await db
      .from("time_entries")
      .select("id, is_finalized")
      .eq("employee_id", employee.id)
      .eq("entry_date", entryDate)
      .eq("project_code", projectCode)
      .maybeSingle();

    if (existing?.is_finalized) {
      skipped++;
      continue;
    }

    if (existing) {
      const { error: upErr } = await db
        .from("time_entries")
        .update({ hours_worked: hoursWorked, notes, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (upErr) {
        errors.push(`Update failed for ${entryDate}/${projectCode}: ${upErr.message}`);
      } else {
        updated++;
      }
    } else {
      const { error: insErr } = await db
        .from("time_entries")
        .insert({
          employee_id: employee.id,
          entry_date: entryDate,
          project_code: projectCode,
          hours_worked: hoursWorked,
          notes,
          is_finalized: false,
          sync_status: "synced",
        });
      if (insErr) {
        errors.push(`Insert failed for ${entryDate}/${projectCode}: ${insErr.message}`);
      } else {
        inserted++;
      }
    }
  }

  const result: Record<string, unknown> = { inserted, updated, skipped };
  if (errors.length > 0) result.errors = errors;

  return new Response(JSON.stringify(result), { status: 200, headers });
});
