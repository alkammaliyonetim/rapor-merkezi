import { isRequestAuthenticated } from "./_lib/session.js";

const PUBLIC_PATHS = new Set(["/login"]);

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname)) {
    return next();
  }
  if (!env.SITE_PASSPHRASE || !env.SESSION_SECRET) {
    return new Response("Site yapilandirmasi eksik: SITE_PASSPHRASE / SESSION_SECRET tanimli degil.", { status: 500 });
  }
  const authed = await isRequestAuthenticated(request, env.SESSION_SECRET);
  if (!authed) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }
  return next();
}
