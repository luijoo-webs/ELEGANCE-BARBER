// Correos de la barbería: confirmación de la reserva y recordatorio 2 horas antes.
// Edge Function de Supabase. La llaman la web al reservar y una tarea programada cada 5 minutos (08_programar_correos.sql).
// Secretos (Edge Functions → Secrets): SMTP_USER = correo Gmail de la barbería, SMTP_PASS = contraseña de aplicación de Gmail.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import nodemailer from "npm:nodemailer@6.9.16";

const SITE = "https://luijoo-webs.github.io/ELEGANCE-BARBER/";
const TZ = "America/Bogota";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Appt = { id: string; cart_id: string | null; service_id: string; client_id: string | null; client_name: string; client_email: string; barber_name: string; service_name: string;
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

// Fotos de los servicios: la subida en el panel o la misma que usa la web según el nombre (js/public.js → SVC_PHOTO).
const F = (n: string) => `${SITE}assets/fotos/${n}.jpg`, REAL = (n: string) => F(`real-${n}`);
const SVC_PHOTO: [RegExp, string][] = [
  [/pigment/, F("srv2-pigmentacion")], [/ceja/, F("srv2-cejas")], [/mascarilla/, F("srv2-mascarilla")], [/cepill/, F("srv-cepillado")],
  [/corte y keratina/, REAL("mullet-barba")], [/querat|keratin/, F("srv2-keratina")], [/niñ/, REAL("fade-diseno")],
  [/corte y barba/, REAL("mohicano-barba")], [/barba/, F("srv-barba")], [/tijera/, REAL("pompadour")],
  [/secado|planchado/, REAL("clasico-linea")], [/cerquillo/, REAL("cerquillo")]
];
const svcPhoto = (name: string, url?: string | null) => /^https:\/\//.test(url || "") ? url! : (SVC_PHOTO.find(([re]) => re.test(name.toLowerCase())) || [, REAL("low-fade")])[1];
// shortcut: copia de la lista de productos de js/public.js (SHOP); si cambia allá, actualizar aquí.
const SHOP_IMG: Record<string, string> = { "Detodito": "detodito", "Margaritas (pollo, limón, tomate…)": "margaritas", "Natuchip": "natuchip", "Boliquesos": "boliquesos",
  "Doritos": "doritos", "Cheestris": "cheestre", "Choclitos": "choclitos", "Maní": "manis", "Chokis": "chockis", "Coronita": "coronita", "Club Colombia": "club-colombia",
  "Stella Artois botella": "stella-botella", "Stella Artois lata": "stella-lata", "Costeña": "costena", "Miller Lite": "miller-lite", "Coca-Cola personal": "coca-cola",
  "Coca-Cola Zero pequeña": "coca-zero", "Agua saborizada pequeña": "agua-saborizada", "Ginger personal": "ginger", "Sprite personal": "sprite",
  "Quatro personal": "quatro-personal", "Kola Román pequeña": "kola-roman", "Jugo del Valle": "jugo-del-valle", "Agua personal": "agua",
  "Quatro pequeña": "quatro-pequena", "Speed Max": "speed-max", "Soda": "soda" };

const GOLD = "#b8913a", INK = "#141312", MUTED = "#6b665f", LINE = "#ece8e1";
function mail(kind: "confirmacion" | "recordatorio", l: Appt[], neg: Record<string, string>, photos: Map<string, string | null>) {
  const a = l[0], last = l[l.length - 1], extras = a.extras ?? [];
  const sSum = l.reduce((t, x) => t + Number(x.price ?? 0), 0), xSum = extras.reduce((t, e) => t + e.q * e.p, 0);
  const priced = l.every((x) => x.price != null);
  const pend = l.some((x) => x.status === "pendiente");
  const first = esc(String(a.client_name || "").trim().split(/\s+/)[0] || "");
  const subject = kind === "recordatorio" ? `Recordatorio: tu cita es a las ${hora(a.starts_at)}`
    : pend ? "Recibimos tu reserva" : `Tu cita está confirmada: ${fecha(a.starts_at)}, ${hora(a.starts_at)}`;
  const label = kind === "recordatorio" ? "Recordatorio · Hoy" : pend ? "Reserva recibida · Pendiente de confirmar" : "Reserva confirmada";
  const title = kind === "recordatorio" ? `${first ? first + ", t" : "T"}u cita es pronto` : pend ? `¡Gracias por reservar${first ? ", " + first : ""}!` : `¡Te esperamos${first ? ", " + first : ""}!`;
  const intro = kind === "recordatorio" ? "Tu cita es en menos de 2 horas. Llega unos minutos antes para atenderte a tiempo."
    : pend ? `Recibimos tu reserva en <b>${esc(neg.nombre || "The Elegance of the Barber")}</b>. La barbería la confirmará pronto y te avisaremos por este medio.`
    : `Tu cita en <b>${esc(neg.nombre || "The Elegance of the Barber")}</b> quedó confirmada. Aquí tienes todos los detalles.`;
  // Invitado (sin cuenta): no tiene "Mis citas"; cambia o cancela por WhatsApp.
  const tel = String(neg.telefono || "").replace(/\D/g, "");
  const wa = /^https:\/\//.test(neg.whatsapp_url || "") ? neg.whatsapp_url : tel ? `https://wa.me/${tel.length === 10 ? "57" + tel : tel}` : "";
  const btn = a.client_id ? [`${SITE}#/cuenta`, "Ver o cambiar mi cita"] : wa ? [esc(wa), "Escribir por WhatsApp"] : null;
  const map = /^https:\/\//.test(neg.mapa_url || "") ? neg.mapa_url : neg.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(neg.direccion)}` : "";

  const item = (img: string, name: string, meta: string, price: string) => `<tr><td style="padding:16px 0;border-top:1px solid ${LINE};width:92px;vertical-align:top">
      <img src="${img}" alt="" width="80" height="96" style="display:block;width:80px;height:96px;object-fit:cover;border-radius:4px;background:#f5f2ed"></td>
    <td style="padding:16px 12px;border-top:1px solid ${LINE};vertical-align:top"><div style="font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.02em">${name}</div>
      <div style="color:${MUTED};font-size:13px;margin-top:4px">${meta}</div></td>
    <td style="padding:16px 0;border-top:1px solid ${LINE};vertical-align:top;text-align:right;white-space:nowrap;font-size:14px">${price}</td></tr>`;
  const sum = (k: string, v: string, strong = false) => `<tr><td style="padding:${strong ? "12px" : "5px"} 0 0;${strong ? `border-top:2px solid ${INK};font-weight:700;font-size:16px` : `color:${MUTED};font-size:14px`}">${k}</td>
    <td style="padding:${strong ? "12px" : "5px"} 0 0;text-align:right;${strong ? `border-top:2px solid ${INK};font-weight:700;font-size:16px` : "font-size:14px"}">${v}</td></tr>`;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  const html = `<div style="background:#f1eee8;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <div style="max-width:560px;margin:auto;background:#fff">
    <div style="background:${INK};padding:26px;text-align:center;border-bottom:3px solid ${GOLD}"><img src="${SITE}assets/logo.jpg" alt="${esc(neg.nombre || "The Elegance of the Barber")}" width="120" style="display:inline-block;border-radius:6px"></div>
    <div style="padding:30px 30px 8px">
      <div style="color:${GOLD};font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase">${label}</div>
      <h1 style="margin:10px 0 14px;font-size:26px;line-height:1.15;text-transform:uppercase">${title}</h1>
      <p style="margin:0 0 20px;line-height:1.6;font-size:15px">${intro}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:${INK};color:#fff"><tr>
        <td style="padding:16px 18px;width:50%;vertical-align:top"><div style="color:${GOLD};font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase">Fecha</div>
          <div style="font-size:17px;font-weight:700;margin-top:6px">${esc(cap(fecha(a.starts_at)))}</div></td>
        <td style="padding:16px 18px;vertical-align:top;border-left:1px solid #333"><div style="color:${GOLD};font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase">Hora</div>
          <div style="font-size:17px;font-weight:700;margin-top:6px">${esc(hora(a.starts_at))} – ${esc(hora(last.ends_at))}</div></td></tr>
        <tr><td colspan="2" style="padding:0 18px 16px;font-size:13px;color:#cfc9bf">Barbero: <b style="color:#fff">${esc(a.barber_name)}</b>${neg.direccion ? ` · ${esc(neg.direccion)}` : ""}</td></tr></table>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px">
        ${l.map((x) => item(esc(svcPhoto(x.service_name, photos.get(x.service_id))), esc(x.service_name), `Servicio · ${Math.round((+new Date(x.ends_at) - +new Date(x.starts_at)) / 60000)} min · ${esc(hora(x.starts_at))}`, x.price != null ? money(Number(x.price)) : "Por confirmar")).join("")}
        ${extras.map((e) => item(SHOP_IMG[e.n] ? `${SITE}assets/tienda/mini/${SHOP_IMG[e.n]}.jpg` : `${SITE}assets/logo.jpg`, esc(e.n), `Cantidad ${e.q} · ${money(e.p)} c/u`, money(e.q * e.p))).join("")}
      </table>
      <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${LINE};padding-top:8px">
        <tr><td colspan="2" style="height:8px"></td></tr>
        ${priced ? sum("Servicios", money(sSum)) : ""}
        ${extras.length ? sum("Snacks y bebidas", money(xSum)) : ""}
        ${sum("Pago", "En la barbería")}
        ${priced ? sum("Total", money(sSum + xSum), true) : ""}
      </table>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:26px 0 6px"><tr>
        ${btn ? `<td style="padding:0 6px 0 0"><a href="${btn[0]}" style="display:block;background:${INK};color:#fff;text-decoration:none;padding:14px 10px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${btn[1]}</a></td>` : ""}
        ${map ? `<td style="padding:0 0 0 6px"><a href="${esc(map)}" style="display:block;border:1px solid ${INK};color:${INK};text-decoration:none;padding:13px 10px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Cómo llegar</a></td>` : ""}
      </tr></table>
      <p style="font-size:12px;color:${MUTED};line-height:1.6;margin:16px 0 0">Pagas en la barbería, después del servicio. Si no puedes asistir, ${a.client_id ? "cancela o reprograma desde tu cuenta" : "avísanos por WhatsApp"} para liberar el horario.</p>
    </div>
    <div style="padding:22px 30px;margin-top:22px;background:#f7f5f1;text-align:center;font-size:12px;color:${MUTED};line-height:1.7">
      <b style="color:${INK};letter-spacing:.12em;text-transform:uppercase">${esc(neg.nombre || "The Elegance of the Barber")}</b><br>
      ${neg.direccion ? `${esc(neg.direccion)}<br>` : ""}<a href="${SITE}" style="color:${GOLD}">Visita nuestra web</a>${wa ? ` · <a href="${esc(wa)}" style="color:${GOLD}">WhatsApp</a>` : ""}
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
  const { data: sv } = await db.from("services").select("id, image_url");
  const photos = new Map((sv ?? []).map((x) => [x.id as string, x.image_url as string | null]));
  let sent = 0, failed = 0;
  for (const [kind, rpc, col] of [["confirmacion", "claim_confirmations", "confirm_sent_at"], ["recordatorio", "claim_reminders", "reminder_sent_at"]] as const) {
    const { data, error } = await db.rpc(rpc);
    if (error) { console.error(rpc, error); continue; }
    for (const l of visits(data as Appt[])) {
      const { subject, html } = mail(kind, l, neg, photos);
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
