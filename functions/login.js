import { createSessionCookie } from "./_lib/session.js";

function loginPage(error) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Giris - Rapor Merkezi</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;font-family:Arial,Helvetica,sans-serif;color:#e8edf5}
  form{background:#111b30;border:1px solid #223050;border-radius:14px;padding:32px;width:280px;box-shadow:0 20px 40px rgba(0,0,0,.35)}
  h1{font-size:18px;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2c3b5c;background:#0b1220;color:#e8edf5;font-size:14px;margin-bottom:14px}
  button{width:100%;padding:10px 12px;border-radius:8px;border:0;background:#4f8cff;color:#fff;font-weight:700;cursor:pointer;font-size:14px}
  button:hover{background:#3f7ae0}
  .error{color:#f87171;font-size:13px;margin:-6px 0 14px}
</style>
</head>
<body>
  <form method="POST">
    <h1>Woodlent Rapor Merkezi</h1>
    ${error ? `<div class="error">Hatali sifre.</div>` : ""}
    <input type="password" name="passphrase" placeholder="Sifre" autofocus required />
    <button type="submit">Giris</button>
  </form>
</body>
</html>`;
}

export async function onRequestGet() {
  return new Response(loginPage(false), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") || "");
  if (!env.SITE_PASSPHRASE || passphrase !== env.SITE_PASSPHRASE) {
    return new Response(loginPage(true), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const cookie = await createSessionCookie(env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: { "Location": "/", "Set-Cookie": cookie }
  });
}
