const COOKIE_NAME = "wl_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + (4 - (value.length % 4)) % 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(secret, expiresAt) {
  const key = await hmacKey(secret);
  const payload = String(expiresAt);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const signature = toBase64Url(new Uint8Array(signatureBuffer));
  return `${payload}.${signature}`;
}

async function verifySession(secret, token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const key = await hmacKey(secret);
  try {
    return await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(payload));
  } catch (error) {
    return false;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function createSessionCookie(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signSession(secret, expiresAt);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function isRequestAuthenticated(request, secret) {
  const token = readCookie(request, COOKIE_NAME);
  return verifySession(secret, token);
}

export { COOKIE_NAME, createSessionCookie, clearSessionCookie, isRequestAuthenticated };
