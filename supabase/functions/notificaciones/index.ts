// Correos de la barbería: confirmación de la reserva y recordatorio 2 horas antes.
// Edge Function de Supabase. La llaman la web al reservar y una tarea programada cada 5 minutos (08_programar_correos.sql).
// Secretos (Edge Functions → Secrets): SMTP_USER = correo Gmail de la barbería, SMTP_PASS = contraseña de aplicación de Gmail.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import nodemailer from "npm:nodemailer@6.9.16";

const SITE = "https://luijoo-webs.github.io/ELEGANCE-BARBER/";
const TZ = "America/Bogota";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Appt = { id: string; cart_id: string | null; client_id: string | null; client_name: string; client_email: string; barber_name: string; service_name: string;
  price: number | null; starts_at: string; ends_at: string; status: string; extras: { n: string; q: number; p: number }[] | null };

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fecha = (d: string) => new Date(d).toLocaleDateString("es-CO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const hora = (d: string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const money = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

// Una visita = las citas del mismo carrito, en orden.
function visits(rows: Appt[]) {
  const m = new Map<string, Appt[]>();
  for (const a of rows) m.set(a.cart_id ?? a.id, [...(m.get(a.cart_id ?? a.id) ?? []), a]);
  return [...m.values()].map((l) => l.sort((x, y) => x.starts_at.localeCompare(y.starts_at)));
}

function mail(kind: "confirmacion" | "recordatorio", l: Appt[], neg: Record<string, string>) {
  const a = l[0], last = l[l.length - 1], extras = a.extras ?? [];
  const total = l.every((x) => x.price != null) ? l.reduce((t, x) => t + Number(x.price), 0) + extras.reduce((t, e) => t + e.q * e.p, 0) : null;
  const pend = l.some((x) => x.status === "pendiente");
  const subject = kind === "recordatorio" ? `Recordatorio: tu cita es a las ${hora(a.starts_at)}`
    : pend ? "Recibimos tu reserva" : `Tu cita está confirmada: ${fecha(a.starts_at)}, ${hora(a.starts_at)}`;
  const intro = kind === "recordatorio" ? "Te recordamos que tu cita es en menos de 2 horas. ¡Te esperamos!"
    : pend ? "Recibimos tu reserva. La barbería la confirmará pronto." : "Tu cita quedó confirmada. Estos son los detalles:";
  // Invitado (sin cuenta): no tiene "Mis citas"; cambia o cancela por WhatsApp.
  const tel = String(neg.telefono || "").replace(/\D/g, "");
  const wa = /^https:\/\//.test(neg.whatsapp_url || "") ? neg.whatsapp_url : tel ? `https://wa.me/${tel.length === 10 ? "57" + tel : tel}` : "";
  const btn = a.client_id ? [`${SITE}#/cuenta`, "Ver o cambiar mi cita"] : wa ? [esc(wa), "Escribir por WhatsApp"] : null;
  const row = (k: string, v: string) => `<tr><td style="padding:8px 0;color:#6b665f;width:40%">${k}</td><td style="padding:8px 0;text-align:right">${v}</td></tr>`;
  const html = `<div style="background:#f5f2ed;padding:24px;font-family:Arial,sans-serif;color:#141312">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#141312;padding:22px;text-align:center"><img src="${SITE}assets/logo.jpg" alt="The Elegance of the Barber" width="110" style="border-radius:8px"></div>
    <div style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 8px">Hola, ${esc(a.client_name || "cliente")}</h1>
      <p style="margin:0 0 18px;line-height:1.5">${intro}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #eee">
        ${row("Fecha", esc(fecha(a.starts_at)))}
        ${row("Hora", `${esc(hora(a.starts_at))} – ${esc(hora(last.ends_at))}`)}
        ${row(l.length > 1 ? "Servicios" : "Servicio", l.map((x) => esc(x.service_name)).join("<br>"))}
        ${row("Barbero", esc(a.barber_name))}
        ${extras.length ? row("Adicionales", extras.map((e) => `${e.q}× ${esc(e.n)}`).join("<br>")) : ""}
        ${total != null ? row("<b>Total a pagar en la barbería</b>", `<b>${money(total)}</b>`) : ""}
        ${neg.direccion ? row("Lugar", esc(neg.direccion)) : ""}
      </table>
      ${btn ? `<p style="margin:22px 0 0"><a href="${btn[0]}" style="background:#141312;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;display:inline-block">${btn[1]}</a></p>` : ""}
      <p style="font-size:12px;color:#6b665f;margin:18px 0 0">Pagas en la barbería. Si no puedes asistir, ${a.client_id ? "cancela o reprograma desde tu cuenta" : "avísanos por WhatsApp"}.</p>
    </div>
  </div></div>`;
  return { subject, html };
}

Deno.serve(async () => {
  const user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  // Sin credenciales no se reclama nada: así ninguna cita queda marcada como avisada sin correo.
  if (!user || !pass) return Response.json({ error: "Faltan los secretos SMTP_USER y SMTP_PASS" }, { status: 500 });
  const { data: s } = await db.from("settings").select("value").eq("key", "negocio").maybeSingle();
  const neg = (s?.value ?? {}) as Record<string, string>;
  const smtp = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: pass.replace(/\s/g, "") } });
  // Se comprueba el acceso a Gmail ANTES de reclamar citas: si falla, nada queda marcado como avisado.
  try { await smtp.verify(); } catch (e) { console.error("gmail", e); return Response.json({ error: `Gmail rechazó el acceso: ${(e as Error).message}` }, { status: 502 }); }
  let sent = 0, failed = 0;
  for (const [kind, rpc, col] of [["confirmacion", "claim_confirmations", "confirm_sent_at"], ["recordatorio", "claim_reminders", "reminder_sent_at"]] as const) {
    const { data, error } = await db.rpc(rpc);
    if (error) { console.error(rpc, error); continue; }
    for (const l of visits(data as Appt[])) {
      const { subject, html } = mail(kind, l, neg);
      try {
        await smtp.sendMail({ from: `${neg.nombre || "The Elegance of the Barber"} <${user}>`, to: l[0].client_email, subject, html });
        sent++;
      } catch (e) {
        failed++; console.error("envío", e);
        await db.from("appointments").update({ [col]: null }).in("id", l.map((x) => x.id));   // se reintenta en la próxima pasada
      }
    }
  }
  smtp.close();
  return Response.json({ sent, failed });
});
