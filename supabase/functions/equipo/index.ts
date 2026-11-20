// Cuentas del equipo: el administrador da acceso a un barbero con su correo.
// Si la persona no tiene cuenta, le llega la invitación (plantilla "Invite user") y ella misma crea su contraseña.
// Si ya tiene cuenta, solo se le asigna el rol. Usa la service_role, que vive solo en Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://theelegancebarber.com/";
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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // Quién llama: debe ser un administrador con sesión.
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  if (!who?.user) return reply({ error: "NO_AUTENTICADO" }, 401);
  const { data: me } = await admin.from("profiles").select("role").eq("id", who.user.id).maybeSingle();
  if (me?.role !== "admin") return reply({ error: "NO_AUTORIZADO" }, 403);

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const barberId = String(body?.barber_id || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return reply({ error: "CORREO_INVALIDO" }, 400);
  const { data: barber } = await admin.from("barbers").select("id, name").eq("id", barberId).is("deleted_at", null).maybeSingle();
  if (!barber) return reply({ error: "BARBERO_NO_DISPONIBLE" }, 400);

  let { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  let invited = false;
  if (!prof) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: SITE, data: { full_name: barber.name } });
    if (error) return reply({ error: /already|registered/i.test(error.message) ? "CORREO_EN_USO" : "INVITACION_FALLIDA", detail: error.message }, 400);
    invited = true;
    prof = { id: data.user.id, role: "client" };
  }
  if (prof.role === "admin") return reply({ error: "ES_ADMINISTRADOR" }, 400);   // no se le quita el acceso total a un dueño por error

  // Una cuenta por barbero: si otra cuenta tenía este barbero, vuelve a cliente.
  await admin.from("profiles").update({ role: "client", barber_id: null }).eq("barber_id", barber.id).neq("id", prof.id);
  const { error: upErr } = await admin.from("profiles").update({ role: "barber", barber_id: barber.id }).eq("id", prof.id);
  if (upErr) return reply({ error: "ROL_NO_ASIGNADO", detail: upErr.message }, 500);
  return reply({ ok: true, invited, barber: barber.name });
});
