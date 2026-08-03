const KNOWN_KEYS = ["imports", "annualInputs", "expenseEdits", "costEdits", "manualEdits"];

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

export async function onRequestGet({ env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase yapilandirmasi eksik" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const keysFilter = KNOWN_KEYS.map(k => `"${k}"`).join(",");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/app_state?select=key,value&key=in.(${keysFilter})`, {
    headers: supabaseHeaders(env)
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: await res.text() }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  const rows = await res.json();
  const out = {};
  KNOWN_KEYS.forEach(key => { out[key] = {}; });
  rows.forEach(row => { out[row.key] = row.value; });
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
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
  const { key, value } = body || {};
  if (!KNOWN_KEYS.includes(key)) {
    return new Response(JSON.stringify({ error: "Bilinmeyen anahtar" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/app_state?on_conflict=key`, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value: value ?? {}, updated_at: new Date().toISOString() }])
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: await res.text() }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}
