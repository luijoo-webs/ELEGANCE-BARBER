// Reserva sin cuenta: valida Turnstile en el servidor y solo entonces crea la cita.
// El secreto TURNSTILE_SECRET vive en Supabase → Edge Functions → Secrets, nunca en el código.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://theelegancebarber.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "METODO_INVALIDO" }, 405);

  const secret = Deno.env.get("TURNSTILE_SECRET");
  const body = await req.json().catch(() => null);
  if (body?.ping) return reply({ configured: Boolean(secret) });   // no revela el secreto: solo si existe
  if (!secret) return reply({ error: "VERIFICACION_NO_DISPONIBLE" }, 503);
  if (!body?.token || !body?.args) return reply({ error: "VERIFICACION_FALLIDA" }, 403);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: String(body.token), ...(ip ? { remoteip: ip } : {}) }),
  }).then((r) => r.json()).catch(() => null);
  if (!check) return reply({ error: "VERIFICACION_NO_DISPONIBLE" }, 503);
  if (!check.success || check.hostname !== "theelegancebarber.com") {
    return reply({ error: "VERIFICACION_FALLIDA", codes: check["error-codes"] ?? [] }, 403);
  }

  const a = body.args;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("book_cart_guest_gate", {
    p_ip: ip || null, p_name: a.p_name, p_phone: a.p_phone, p_email: a.p_email, p_services: a.p_services, p_barber: a.p_barber,
    p_start: a.p_start, p_notes: a.p_notes, p_extras: a.p_extras, p_payment: a.p_payment,
  });
  if (error) return reply({ error: error.message }, 400);
  return reply(data);
});
