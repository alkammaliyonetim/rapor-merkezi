function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase yapilandirmasi eksik" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/audit_log?select=*&order=ts.desc&limit=${limit}`, {
    headers: supabaseHeaders(env)
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: await res.text() }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase yapilandirmasi eksik" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Gecersiz istek govdesi" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const { action_type, entity, year = null, month = null, old_value = null, new_value = null, note = null } = body || {};
  if (!action_type || !entity) {
    return new Response(JSON.stringify({ error: "action_type ve entity zorunlu" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "return=representation" },
    body: JSON.stringify([{ action_type, entity, year: year ? String(year) : null, month, old_value, new_value, note }])
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: await res.text() }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
}
