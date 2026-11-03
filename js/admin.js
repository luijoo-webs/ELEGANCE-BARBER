/* Panel administrativo (#/admin/...). Toda escritura la autoriza el servidor (RLS + RPC con is_admin()). */
import {
  sb, State, $, $$, esc, safeUrl, money, priceLabel, durLabel, DAYS, DAYS_SHORT, todayYmd, addDays, mondayOf, weekday, ymd, toIso, hhmm,
  fmtTime, fmtDate, fmtDay, fmtDateTime, minutes, fromMinutes, shortTime, STATUS, statusBadge, friendly, toast, loader, emptyState,
  formData, setMsg, busy, modal, confirmDialog, uploadImage, loadPublic, isAdmin, extrasText, extrasTotal
} from "./core.js?v=20261103e";
import { SHOP, svcPhoto } from "./public.js?v=20261103e";

const SECTIONS = [
  ["resumen", "Resumen"], ["agenda", "Agenda"], ["ventas", "Ventas"], ["citas", "Citas"], ["servicios", "Servicios"], ["barberos", "Barberos"],
  ["clientes", "Clientes"], ["horarios", "Horarios y cierres"], ["configuracion", "Configuración"], ["estadisticas", "Estadísticas"]
];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
const like = (t) => String(t).replace(/[,()%*\\]/g, " ").trim();   // texto seguro dentro de filtros or()
const refresh = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
const go = (h) => { if (location.hash === h) refresh(); else location.hash = h; };
const hrefWith = (base, query, patch) => `${base}?${new URLSearchParams(Object.entries({ ...query, ...patch }).filter(([, v]) => v !== "" && v != null))}`;
const barberName = (id) => State.barbers.find((b) => b.id === id)?.name || "—";
let channel = null;
const waNum = (t) => { const d = String(t).replace(/\D/g, ""); return d.length === 10 ? "57" + d : d; };   // celular colombiano sin indicativo

const initials = (t) => String(t || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avatar = (name, url) => `<span class="av">${safeUrl(url) ? `<img src="${esc(url)}" alt="">` : esc(initials(name))}</span>`;
const apptPhoto = (a) => svcPhoto(State.services.find((s) => s.id === (a.services?.[0]?.id || a.service_id)) || { name: a.services?.[0]?.n || a.service_name });
const apptTotal = (a) => Number(a.price || 0) + extrasTotal(a.extras);
const waLinkTo = (phone) => `https://wa.me/${esc(waNum(phone))}`;
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.3 7.9L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>';

/* Seguimiento de la cita: cada paso se puede tocar, para avanzar o corregir. Solo "Completada" suma a finanzas. */
const STEPS = ["pendiente", "confirmada", "en_proceso", "completada"];
const LIVE = STEPS;   // las que ocupan la agenda; ni canceladas ni quien no vino
const OPEN = STEPS.slice(0, 3);   // falta cerrarlas
const stepper = (a, attr) => { const at = STEPS.indexOf(a.status);
  return a.status === "cancelada" ? "" : `<ol class="steps">${STEPS.map((k, i) => `<li class="${i < at ? "is-done" : i === at ? "is-on" : ""}"><button type="button" ${attr}="${k}" ${i === at ? `disabled aria-current="step"` : ""}><i></i>${STATUS[k]}</button></li>`).join("")}</ol>`; };
function stepActions(a, attr) {
  const started = new Date(a.starts_at) <= new Date(), ended = new Date(a.ends_at) <= new Date();
  const main = a.status === "pendiente" && !ended ? ["confirmada", "Confirmar"] : a.status === "en_proceso" ? ["completada", "Terminar y cobrar"]
    : OPEN.includes(a.status) && ended ? ["completada", "Sí vino: completar"] : a.status === "confirmada" ? ["en_proceso", "Llegó: a la silla"] : a.status === "no_asistio" ? ["confirmada", "Sí vino"] : null;
  return `${main ? `<button class="btn btn--sm" type="button" ${attr}="${main[0]}">${main[1]}</button>` : ""}${started && ["pendiente", "confirmada"].includes(a.status) ? `<button class="btn btn--sm btn--ghost" type="button" ${attr}="no_asistio">No vino</button>` : ""}`;
}
// El pago es en la barbería: una cita reservada o confirmada todavía no es dinero.
const PAY_NOTE = { pendiente: "Sin pagar · por ver si llega", confirmada: "Sin pagar · por ver si llega", en_proceso: "Sin pagar · en la silla", completada: "Pagada", no_asistio: "No llegó · no pagó" };
const payNote = (a) => PAY_NOTE[a.status] ? `<p class="paynote paynote--${a.status === "completada" ? "ok" : a.status === "no_asistio" ? "no" : "wait"}">${PAY_NOTE[a.status]}</p>` : "";
const payMethod = (a) => a.payment_method ? `${a.status === "completada" ? "Pagó con" : a.status === "cancelada" || a.status === "no_asistio" ? "Iba a pagar con" : "Pagará con"} ${esc(a.payment_method)}` : "";
const stToast = (st) => st === "completada" ? "Cita completada: se sumó a finanzas." : `Estado: ${STATUS[st]}.`;

/* Tarjeta de cita (Citas y ficha de cliente): foto del servicio, seguimiento y acciones rápidas. */
function apptCard(a, { client = true } = {}) {
  const more = (a.services?.length || 1) - 1;
  return `<article class="acard acard--${a.status}" data-appt="${a.id}" tabindex="0">
    <div class="acard__pic"><img src="${esc(apptPhoto(a))}" alt="" loading="lazy"><strong class="acard__time">${fmtTime(a.starts_at)}</strong>${statusBadge(a.status)}${more ? `<span>+${more}</span>` : ""}</div>
    <div class="acard__body">
      ${client ? "" : `<p class="muted" style="margin:0;font-size:.8rem">${esc(fmtDate(a.starts_at))}</p>`}
      ${client ? `<p class="acard__who">${esc(a.client_name || "Cliente")}${a.client_id ? "" : " <small>invitado</small>"}</p>` : ""}
      <h3>${esc(a.service_name)}</h3>
      <p class="acard__meta"><span>${esc(a.barber_name)}</span>${a.price != null || a.extras?.length ? `<b>${money(apptTotal(a))}</b>` : ""}${a.payment_method ? `<span>${payMethod(a)}</span>` : ""}${a.extras?.length ? `<span>+ ${esc(extrasText(a.extras))}</span>` : ""}</p>
      ${payNote(a)}
      ${stepper(a, "data-qst")}
      <div class="acard__acts">
        ${stepActions(a, "data-qst")}
        ${a.client_phone ? `<a class="acard__wa" href="${waLinkTo(a.client_phone)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(a.client_name)}">${WA_ICON}</a>` : ""}
      </div>
    </div></article>`;
}
function bindAppts(root) {
  const open = (e) => {
    if (e.target.closest("a")) return;
    const r = e.target.closest("[data-appt]"); if (!r) return;
    if (e.type === "keydown" && (e.key !== "Enter" || e.target !== r)) return;
    const qs = e.target.closest("[data-qst]");
    if (!qs) return apptDetail(r.dataset.appt);
    busy(qs, async () => {
      const { error } = await sb.rpc("admin_set_status", { p_id: r.dataset.appt, p_status: qs.dataset.qst, p_reason: null });
      if (error) return toast(friendly(error), "err");
      toast(stToast(qs.dataset.qst)); refresh();
    });
  };
  root.addEventListener("click", open); root.addEventListener("keydown", open);
}

const ICON = {
  resumen: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  agenda: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ventas: '<path d="M3 4h2l2.4 11h11.2L21 7H6.2M9 20h.01M18 20h.01"/>',
  citas: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  servicios: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  barberos: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.6-5 7-5s6 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.3 2.2 4 5"/>',
  horarios: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  configuracion: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  actividad: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  estadisticas: '<path d="M3 21h18M6 17V10M11 17V5M16 17v-4M21 17V8"/>',
  sitio: '<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/><circle cx="12" cy="12" r="9"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  cuenta: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
};
const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-logout]")) return;
  e.preventDefault(); await sb.auth.signOut(); location.hash = "#/";
});

function shell(sec, title, actions, body) {
  const logo = safeUrl(State.settings.negocio?.logo_url) || "assets/logo-crown-light.png";
  return `<div class="adm">
    <aside class="adm__side">
      <a class="adm__brand" href="#/admin" aria-label="Panel — inicio"><img src="${esc(logo)}" alt=""><span><b>Elegance</b><small>Panel admin</small></span></a>
      <p class="adm__label">Gestión</p>
      <nav aria-label="Secciones del panel">${SECTIONS.map(([k, v]) => `<a href="#/admin/${k}" class="${k === sec ? "is-on" : ""}" ${k === sec ? 'aria-current="page"' : ""}>${ico(k)}${v}</a>`).join("")}</nav>
      <div class="adm__bottom"><a href="#/">${ico("sitio")}Ver sitio</a><a href="#/cuenta">${ico("cuenta")}Mi cuenta</a><a href="#/" data-logout>${ico("salir")}Cerrar sesión</a></div>
    </aside>
    <div class="adm__main"><div class="adm__head"><h1>${title}</h1><div class="row">${actions || ""}</div></div>${body}</div></div>`;
}

export async function view(sec, sub, query) {
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!isAdmin()) return { html: emptyState("No tienes permisos de administrador.") };
  await loadPublic();   // con sesión de admin, RLS devuelve también lo inactivo
  const views = { resumen: vResumen, agenda: vAgenda, ventas: vVentas, citas: vCitas, servicios: vServicios, barberos: vBarberos, clientes: vClientes,
    horarios: vHorarios, configuracion: vConfig, consentimientos: vConsentimientos, estadisticas: vEstadisticas };
  const fn = views[sec];
  if (!fn) return { html: shell("", "Sección no encontrada", "", emptyState("Esa sección no existe.")) };
  try { return await fn(sub, query); }
  catch (e) { console.error(e); return { html: shell(sec, "Error", "", `<div class="notice notice--warn">${esc(friendly(e))}</div>`) }; }
}

/* =============================== RESUMEN =============================== */
async function vResumen(_, query) {
  const today = todayYmd();
  const preset = query.p || "30";
  const from = query.desde || (preset === "hoy" ? today : addDays(today, -Number(preset) + 1));
  const to = query.hasta || (preset === "hoy" ? today : addDays(today, 0));
  const [st, upcoming] = await Promise.all([
    q(sb.rpc("admin_stats", { p_from: from, p_to: to })),
    q(sb.from("appointments").select("*").in("status", ["pendiente", "confirmada"]).gte("starts_at", new Date().toISOString())
      .lt("starts_at", toIso(addDays(today, 1), "00:00")).order("starts_at").limit(30))
  ]);
  const { count: pendingAll } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pendiente").gte("starts_at", new Date().toISOString());
  const services = State.services, barbers = State.barbers;
  const alerts = [];
  if (!State.schedules.some((s) => !s.barber_id)) alerts.push(`No hay horario general del negocio: nadie puede reservar. <a href="#/admin/horarios">Configurar horario</a>`);
  if (!barbers.some((b) => b.active)) alerts.push(`No hay barberos activos. <a href="#/admin/barberos">Agregar barbero</a>`);
  if (!services.some((s) => s.active)) alerts.push(`No hay servicios activos. <a href="#/admin/servicios">Agregar servicio</a>`);
  const noPrice = services.filter((s) => s.active && s.price == null).length;
  if (noPrice) alerts.push(`${noPrice} servicio(s) activos sin precio: se muestran como “Precio por confirmar”. <a href="#/admin/servicios?f=sinprecio">Revisar</a>`);
  if (pendingAll) alerts.push(`${pendingAll} cita(s) pendientes de confirmar. <a href="#/admin/citas?estado=pendiente">Ver</a>`);
  const maxDay = Math.max(1, ...st.por_dia.map((d) => d.n));
  const every = Math.ceil(st.por_dia.length / 15);
  const bars = (list) => { const m = Math.max(1, ...list.map((x) => x.n)); return list.length ? `<div class="bars">${list.map((x) => `<div class="bar"><span class="bar__label" title="${esc(x.nombre)}">${esc(x.nombre)}</span><span class="bar__track"><span class="bar__fill" style="width:${(x.n / m) * 100}%"></span></span><span class="bar__n">${x.n}</span></div>`).join("")}</div>` : `<p class="muted">Sin citas en el periodo.</p>`; };

  const html = shell("resumen", "Resumen", `<a class="btn btn--sm" href="#/admin/agenda">Abrir agenda</a>`, `
    ${alerts.map((a) => `<div class="notice notice--warn">${a}</div>`).join("")}
    <form class="toolbar" id="rangeForm">
      <div class="seg" role="group" aria-label="Periodo">${[["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["90", "90 días"]].map(([k, v]) => `<button type="button" data-p="${k}" class="${!query.desde && preset === k ? "is-on" : ""}">${v}</button>`).join("")}</div>
      <input type="date" name="desde" value="${from}" aria-label="Desde"><input type="date" name="hasta" value="${to}" aria-label="Hasta">
      <button class="btn btn--sm btn--ghost" type="submit">Aplicar</button>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Citas de hoy</span><strong>${st.hoy}</strong><small>sin canceladas</small></div>
      <div class="kpi"><span>Pendientes de confirmar</span><strong>${st.pendientes}</strong><small>próximas</small></div>
      <div class="kpi"><span>Confirmadas</span><strong>${st.confirmadas}</strong><small>en el periodo</small></div>
      <div class="kpi"><span>Completadas</span><strong>${st.completadas}</strong><small>en el periodo</small></div>
      <div class="kpi"><span>Canceladas</span><strong>${st.canceladas}</strong><small>en el periodo</small></div>
      <div class="kpi"><span>Clientes registrados</span><strong>${st.clientes}</strong><small>+${st.clientes_nuevos} en el periodo</small></div>
    </div>
    <div class="card" style="margin-bottom:14px"><h2>Citas por día <span class="muted small">(${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short" })}, sin canceladas)</span></h2>
      <div class="cols">${st.por_dia.map((d, i) => `<div class="cols__c" title="${fmtDay(d.dia, { weekday: "short", day: "numeric", month: "short" })}: ${d.n}"><div class="cols__b" style="height:${(d.n / maxDay) * 100}%"></div><span class="cols__l">${i % every ? "&nbsp;" : fmtDay(d.dia, { day: "numeric", month: "numeric" })}</span></div>`).join("")}</div></div>
    <div class="cards-2">
      <div class="card"><h2>Servicios más reservados</h2>${bars(st.por_servicio)}</div>
      <div class="card"><h2>Barberos con más citas</h2>${bars(st.por_barbero)}</div>
    </div>
    <div class="cards-2">
      <div class="card"><h2>Próximas citas de hoy</h2>${upcoming.length ? `<ul class="log" style="list-style:none;padding:0;margin:0">${upcoming.map((a) => `<li><a href="#/admin/agenda?fecha=${today}" style="text-decoration:none"><strong>${fmtTime(a.starts_at)}</strong> · ${esc(a.client_name)} · ${esc(a.service_name)} · ${esc(a.barber_name)}</a> ${statusBadge(a.status)}</li>`).join("")}</ul>` : `<p class="muted">No quedan citas hoy.</p>`}</div>
      <div class="card"><h2>Valor de servicios completados</h2>
        ${st.valor_completadas != null ? `<strong style="font:800 2rem var(--sans)">${money(st.valor_completadas)}</strong>` : `<p class="muted">Sin datos.</p>`}
        <p class="muted small">Estimación: suma el precio registrado al reservar de las citas marcadas como <b>completadas</b>. No es un registro de pagos: la web no cobra en línea.${st.completadas_sin_precio ? ` ${st.completadas_sin_precio} completada(s) sin precio no suman.` : ""}</p></div>
    </div>`);
  const mount = () => {
    $("#rangeForm").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) go(`#/admin/resumen?p=${b.dataset.p}`); });
    $("#rangeForm").addEventListener("submit", (e) => { e.preventDefault(); const f = formData(e.target); if (f.desde && f.hasta) go(`#/admin/resumen?desde=${f.desde}&hasta=${f.hasta}`); });
  };
  return { html, mount };
}

/* =============================== AGENDA =============================== */
const SLOT = 15, PX = 1.6;   // 15 min por fila, 1.6 px por minuto
// Franjas abiertas (minutos) de un día: horario general ∩ horario propio del barbero (si tiene).
function windows(dateStr, barberId) {
  const dow = weekday(dateStr);
  const rng = (r) => [minutes(r.start_time), minutes(r.end_time)];
  const biz = State.schedules.filter((s) => !s.barber_id && s.weekday === dow).map(rng);
  const own = barberId ? State.schedules.filter((s) => s.barber_id === barberId) : [];
  if (!own.length) return biz;
  const mine = own.filter((s) => s.weekday === dow).map(rng), out = [];
  for (const a of biz) for (const b of mine) { const s = Math.max(a[0], b[0]), e = Math.min(a[1], b[1]); if (e > s) out.push([s, e]); }
  return out;
}

async function vAgenda(_, query) {
  const today = todayYmd();
  const mode = query.vista === "semana" ? "semana" : "dia";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.fecha || "") ? query.fecha : today;
  const from = mode === "semana" ? mondayOf(date) : date;
  const days = mode === "semana" ? 7 : 1;
  const to = addDays(from, days - 1);
  const barberF = query.barbero || "";
  const statusF = query.estado || "activas";
  const barbers = State.barbers.filter((b) => b.active && !b.deleted_at && (!barberF || b.id === barberF));
  const rs = toIso(from, "00:00"), re = toIso(addDays(to, 1), "00:00");

  let qa = sb.from("appointments").select("*").gte("starts_at", rs).lt("starts_at", re).order("starts_at");
  if (barberF) qa = qa.eq("barber_id", barberF);
  if (statusF === "activas") qa = qa.in("status", LIVE); else if (statusF !== "todas") qa = qa.eq("status", statusF);
  let qt = sb.from("time_off").select("*").lt("starts_at", re).gt("ends_at", rs);
  const wk = mondayOf(date);
  const [appts, offs, weekAppts] = await Promise.all([q(qa), q(qt),
    q(sb.from("appointments").select("starts_at").in("status", LIVE).gte("starts_at", toIso(wk, "00:00")).lt("starts_at", toIso(addDays(wk, 7), "00:00")))]);
  const dayCount = (d) => weekAppts.filter((a) => ymd(new Date(a.starts_at)) === d).length;
  const live = appts.filter((a) => LIVE.includes(a.status));
  const nextA = live.find((a) => new Date(a.starts_at) > new Date());
  const offsF = offs.filter((t) => !barberF || !t.barber_id || t.barber_id === barberF);

  // Columnas: modo día → un barbero por columna; modo semana → un día por columna.
  const cols = mode === "dia"
    ? barbers.map((b) => ({ key: b.id, date, barberId: b.id, label: `<span class="agenda__who">${avatar(b.name, b.photo_url)}${esc(b.name)}</span>`, sub: "" }))
    : Array.from({ length: 7 }, (_, i) => { const d = addDays(from, i); return { key: d, date: d, barberId: barberF || null, label: DAYS_SHORT[weekday(d)] + " " + +d.slice(8), sub: fmtDay(d, { month: "short" }), today: d === today }; });
  // Rango horario visible: el de apertura de los días mostrados (8–20 si no hay horario).
  let lo = 24 * 60, hi = 0;
  cols.forEach((c) => windows(c.date, c.barberId).forEach(([s, e]) => { lo = Math.min(lo, s); hi = Math.max(hi, e); }));
  appts.forEach((a) => { lo = Math.min(lo, minutes(hhmm(a.starts_at))); hi = Math.max(hi, minutes(hhmm(a.starts_at)) + a.duration_min); });
  if (hi <= lo) { lo = 8 * 60; hi = 20 * 60; }
  lo = Math.floor(lo / 60) * 60; hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  const rows = (hi - lo) / SLOT, H = SLOT * PX;
  const nb = Math.max(1, barbers.length);

  const colHtml = (c) => {
    const open = windows(c.date, c.barberId);
    const isOpen = (m) => open.some(([s, e]) => m >= s && m + SLOT <= e);
    const slots = Array.from({ length: rows }, (_, i) => { const m = lo + i * SLOT; const ok = isOpen(m);
      return `<div class="agenda__slot${m % 60 ? "" : " is-hour"}${ok ? "" : " is-closed"}" style="height:${H}px" ${ok ? `data-new="${c.date}|${fromMinutes(m)}|${c.barberId || ""}" title="Nueva cita ${fromMinutes(m)}"` : ""}></div>`; }).join("");
    const evs = appts.filter((a) => ymd(new Date(a.starts_at)) === c.date && (mode === "semana" || a.barber_id === c.barberId)).map((a) => {
      const top = (minutes(hhmm(a.starts_at)) - lo) * PX, h = Math.max(18, a.duration_min * PX - 2);
      const idx = Math.max(0, barbers.findIndex((b) => b.id === a.barber_id));
      const split = mode === "semana" && !barberF && nb > 1 ? `left:calc(${(idx / nb) * 100}% + 2px);right:auto;width:calc(${100 / nb}% - 4px);` : "";
      return `<button type="button" class="ev ev--${a.status}" style="top:${top}px;height:${h}px;${split}" data-appt="${a.id}" title="${esc(`${fmtTime(a.starts_at)} ${a.client_name} · ${a.service_name} · ${a.barber_name}`)}">
        ${mode === "dia" ? `<img src="${esc(apptPhoto(a))}" alt="" loading="lazy">` : ""}<span><strong>${fmtTime(a.starts_at)} ${esc(a.client_name)}</strong>${esc(a.service_name)}${mode === "semana" && !barberF ? ` · ${esc(a.barber_name)}` : ""}</span></button>`;
    }).join("");
    const blocks = offsF.filter((t) => !t.barber_id || mode === "semana" || t.barber_id === c.barberId).map((t) => {
      const ds = new Date(toIso(c.date, "00:00")).getTime(), de = ds + 864e5;
      const s = Math.max(new Date(t.starts_at).getTime(), ds), e = Math.min(new Date(t.ends_at).getTime(), de);
      if (e <= s) return "";
      const sm = Math.max(lo, (s - ds) / 6e4), em = Math.min(hi, (e - ds) / 6e4);
      if (em <= sm) return "";
      return `<button type="button" class="ev ev--block" style="top:${(sm - lo) * PX}px;height:${(em - sm) * PX}px" data-off="${t.id}" title="${esc(t.reason || t.kind)}"><strong>${esc(KIND[t.kind] || t.kind)}${t.barber_id ? "" : " · negocio"}</strong>${esc(t.reason || "")}${mode === "semana" && t.barber_id && !barberF ? ` · ${esc(barberName(t.barber_id))}` : ""}</button>`;
    }).join("");
    const nowM = minutes(hhmm(new Date()));
    const nowLine = c.date === today && nowM >= lo && nowM <= hi ? `<div class="agenda__now" style="top:${(nowM - lo) * PX}px"></div>` : "";
    return `<div class="agenda__col">${slots}${evs}${blocks}${nowLine}</div>`;
  };

  const nav = (n) => hrefWith("#/admin/agenda", query, { fecha: addDays(date, n * days) });
  const body = !barbers.length ? emptyState("No hay barberos activos.", "Crea un barbero para usar la agenda.", `<a class="btn" href="#/admin/barberos">Ir a barberos</a>`) : `
    <nav class="wkstrip" aria-label="Días de la semana">${Array.from({ length: 7 }, (_, i) => { const d = addDays(wk, i), n = dayCount(d);
      return `<a href="${hrefWith("#/admin/agenda", query, { fecha: d, vista: "dia" })}" class="${d === date && mode === "dia" ? "is-on" : ""}${d === today ? " is-today" : ""}"><small>${DAYS_SHORT[weekday(d)]}</small><b>${+d.slice(8)}</b><span>${n ? `${n} cita${n > 1 ? "s" : ""}` : "Libre"}</span></a>`; }).join("")}</nav>
    <div class="agstats">
      <div><b>${live.length}</b><span>citas ${mode === "dia" ? "este día" : "esta semana"}</span></div>
      <div><b>${live.filter((a) => a.status === "pendiente").length}</b><span>por confirmar</span></div>
      <div><b>${money(live.reduce((t, a) => t + apptTotal(a), 0))}</b><span>valor de las citas</span></div>
      <div class="agstats__next">${nextA ? `<img src="${esc(apptPhoto(nextA))}" alt=""><span><b>${fmtTime(nextA.starts_at)} · ${esc(nextA.client_name)}</b><span>Próxima cita · ${esc(nextA.barber_name)}</span></span>` : `<span><b>Sin citas pendientes</b><span>en este rango</span></span>`}</div>
    </div>
    <div class="toolbar">
      <a class="icon-btn" href="${nav(-1)}" aria-label="Anterior" style="display:grid;place-items:center;text-decoration:none">‹</a>
      <a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/agenda", query, { fecha: today })}">Hoy</a>
      <a class="icon-btn" href="${nav(1)}" aria-label="Siguiente" style="display:grid;place-items:center;text-decoration:none">›</a>
      <strong>${mode === "dia" ? cap(fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`}</strong>
      <input type="date" id="agDate" value="${date}" aria-label="Ir a fecha">
      <div class="seg" role="group" aria-label="Vista"><a href="${hrefWith("#/admin/agenda", query, { vista: "dia" })}" class="${mode === "dia" ? "is-on" : ""}">Día</a><a href="${hrefWith("#/admin/agenda", query, { vista: "semana" })}" class="${mode === "semana" ? "is-on" : ""}">Semana</a></div>
      <select id="agBarber" aria-label="Barbero"><option value="">Todos los barberos</option>${State.barbers.filter((b) => b.active && !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === barberF ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <select id="agStatus" aria-label="Estado">${[["activas", "Activas"], ["pendiente", "Pendientes"], ["confirmada", "Confirmadas"], ["en_proceso", "En silla"], ["completada", "Completadas"], ["no_asistio", "No vinieron"], ["cancelada", "Canceladas"], ["todas", "Todas"]].map(([k, v]) => `<option value="${k}" ${k === statusF ? "selected" : ""}>${v}</option>`).join("")}</select>
    </div>
    <div class="agenda"><div class="agenda__grid" style="grid-template-columns:56px repeat(${cols.length}, minmax(${mode === "dia" ? 170 : 130}px, 1fr))">
      <div class="agenda__hcell" style="min-width:56px"></div>
      ${cols.map((c) => `<div class="agenda__hcell${c.today ? " is-today" : ""}">${c.label}<small>${c.sub || (mode === "dia" ? (windows(c.date, c.barberId).map(([s, e]) => `${fromMinutes(s)}–${fromMinutes(e)}`).join(", ") || "No trabaja") : "")}</small></div>`).join("")}
      <div class="agenda__times">${Array.from({ length: rows }, (_, i) => { const m = lo + i * SLOT; return `<div class="agenda__time" style="height:${H}px">${m % 60 ? "" : fromMinutes(m)}</div>`; }).join("")}</div>
      ${cols.map(colHtml).join("")}
    </div></div>
    <div class="legend"><span><i style="background:#effaf2;border-color:#1f6b3a"></i>Confirmada</span><span><i style="background:#fff6e0;border-color:#c98a0b"></i>Pendiente</span><span><i style="background:#f1f0ed;border-color:#8c8a85"></i>Completada</span><span><i style="background:#fdf0ef;border-color:#b42318"></i>Bloqueo / cierre</span><span><i class="agenda__slot is-closed" style="display:inline-block"></i>Fuera de horario</span><span>Clic en un espacio libre para crear una cita.</span></div>`;

  const html = shell("agenda", "Agenda", `<button class="btn btn--sm btn--ghost" id="newBlock" type="button">Bloquear horario</button><button class="btn btn--sm" id="newAppt" type="button">Nueva cita</button>`, body);
  const mount = () => {
    $("#agDate")?.addEventListener("change", (e) => e.target.value && go(hrefWith("#/admin/agenda", query, { fecha: e.target.value })));
    $("#agBarber")?.addEventListener("change", (e) => go(hrefWith("#/admin/agenda", query, { barbero: e.target.value })));
    $("#agStatus")?.addEventListener("change", (e) => go(hrefWith("#/admin/agenda", query, { estado: e.target.value })));
    $("#newAppt").addEventListener("click", () => apptEditor({ date, barberId: barberF }));
    $("#newBlock").addEventListener("click", () => blockEditor({ date, barberId: barberF }));
    $(".agenda")?.addEventListener("click", async (e) => {
      const ev = e.target.closest("[data-appt]");
      if (ev) return apptDetail(ev.dataset.appt);
      const off = e.target.closest("[data-off]");
      if (off) return offDetail(offs.find((t) => t.id === off.dataset.off));
      const s = e.target.closest("[data-new]");
      if (s) { const [d, t, b] = s.dataset.new.split("|"); apptEditor({ date: d, time: t, barberId: b || barberF }); }
    });
    // Tiempo real: si alguien reserva o cancela, la agenda se actualiza sola.
    channel = sb.channel("agenda").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
      if (!document.querySelector(".modal")) refresh();
    }).subscribe();
  };
  return { html, mount };
}

const KIND = { cierre: "Cierre", festivo: "Festivo", vacaciones: "Vacaciones", bloqueo: "Bloqueo" };

/* Crear o reprogramar una cita (valida en el servidor: horario, bloqueos y solapamientos). */
function apptEditor({ appt = null, date = todayYmd(), time = "", barberId = "", clientId = null, clientName = "", walkName = "", walkPhone = "" } = {}) {
  const services = State.services.filter((s) => !s.deleted_at && (s.active || s.id === appt?.service_id));
  const barbers = State.barbers.filter((b) => b.active && !b.deleted_at);
  let client = appt ? { id: appt.client_id, name: appt.client_name } : clientId ? { id: clientId, name: clientName } : null;
  const d0 = appt ? ymd(new Date(appt.starts_at)) : date, t0 = appt ? hhmm(appt.starts_at) : time;
  const m = modal(`<h2 class="modal__t">${appt ? "Reprogramar / editar cita" : "Nueva cita"}</h2>
    <form class="form" id="apptForm" novalidate>
      ${appt ? `<p class="muted">Cliente: <strong>${esc(appt.client_name)}</strong></p>` : `
      <div class="field"><span>Cliente registrado</span><input id="cliSearch" placeholder="Buscar por nombre, correo o celular" autocomplete="off" value="${esc(client?.name || "")}">
        <div id="cliResults" class="pick-list"></div></div>
      <div class="grid-2" id="walkin" ${client ? "hidden" : ""}><label class="field"><span>…o nombre (sin cuenta)</span><input name="client_name" maxlength="120" value="${esc(walkName)}"></label>
        <label class="field"><span>Celular</span><input name="client_phone" type="tel" maxlength="30" value="${esc(walkPhone)}"></label></div>`}
      <div class="grid-2">
        <label class="field"><span>Servicio</span><select name="service" required>${services.map((s) => `<option value="${s.id}" ${s.id === appt?.service_id ? "selected" : ""}>${esc(s.name)} · ${durLabel(s.duration_min)}</option>`).join("")}</select></label>
        <label class="field"><span>Barbero</span><select name="barber" required>${barbers.map((b) => `<option value="${b.id}" ${b.id === (appt?.barber_id || barberId) ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Fecha</span><input type="date" name="date" required min="${todayYmd()}" value="${d0}"></label>
        <label class="field"><span>Hora</span><input type="time" name="time" required step="300" value="${t0}"></label>
      </div>
      <div><span class="muted small">Horas libres ese día (según reglas de reserva):</span><div id="freeSlots" class="slots__grid" style="margin-top:6px"></div></div>
      <label class="field"><span>Estado</span><select name="status"><option value="confirmada">Confirmada</option><option value="pendiente" ${appt?.status === "pendiente" ? "selected" : ""}>Pendiente</option></select></label>
      <label class="field"><span>Notas internas (solo administración)</span><textarea name="admin_notes" rows="2" maxlength="2000">${esc(appt?.admin_notes || "")}</textarea></label>
      <button class="btn btn--block" type="submit" data-busy="Validando y guardando…">${appt ? "Guardar cambios" : "Crear cita"}</button>
      <p class="form-msg" id="apptMsg" role="alert"></p>
    </form>`, { wide: true });
  const form = $("#apptForm", m.el);
  if (!services.length || !barbers.length) setMsg($("#apptMsg", m.el), "Necesitas al menos un servicio y un barbero activos.");
  async function free() {
    const f = formData(form), box = $("#freeSlots", m.el);
    if (!f.service || !f.barber || !f.date) return;
    box.innerHTML = `<span class="muted small">Buscando…</span>`;
    const { data, error } = await sb.rpc("get_availability", { p_service: f.service, p_barber: f.barber, p_from: f.date, p_days: 1 });
    box.innerHTML = error ? `<span class="muted small">${esc(friendly(error))}</span>` : data.length
      ? data.map((s) => `<button type="button" class="slot" data-t="${hhmm(s.slot_start)}">${fmtTime(s.slot_start)}</button>`).join("")
      : `<span class="muted small">Sin horas libres (o el día está cerrado). Puedes escribir una hora: el sistema la validará.</span>`;
  }
  form.addEventListener("change", (e) => { if (["service", "barber", "date"].includes(e.target.name)) free(); });
  $("#freeSlots", m.el).addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { form.time.value = b.dataset.t; $$(".slot", m.el).forEach((x) => x.classList.toggle("is-sel", x === b)); } });
  free();
  if (!appt) {
    let timer;
    $("#cliSearch", m.el).addEventListener("input", (e) => {
      client = null; $("#walkin", m.el).hidden = false;
      clearTimeout(timer);
      const t = like(e.target.value);
      if (t.length < 2) { $("#cliResults", m.el).innerHTML = ""; return; }
      timer = setTimeout(async () => {
        const { data } = await sb.from("profiles").select("id,full_name,email,phone").or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`).limit(6);
        $("#cliResults", m.el).innerHTML = (data || []).map((p) => `<button type="button" class="pick" data-cli="${p.id}" data-name="${esc(p.full_name || p.email)}"><span class="pick__main"><strong>${esc(p.full_name || "(sin nombre)")}</strong><small>${esc(p.email || "")} ${esc(p.phone || "")}</small></span></button>`).join("") || `<span class="muted small">Sin resultados: usa nombre sin cuenta.</span>`;
      }, 250);
    });
    $("#cliResults", m.el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-cli]"); if (!b) return;
      client = { id: b.dataset.cli, name: b.dataset.name };
      $("#cliSearch", m.el).value = client.name; $("#cliResults", m.el).innerHTML = ""; $("#walkin", m.el).hidden = true;
    });
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(form);
    if (!appt && !client && !(f.client_name || "").trim()) return setMsg($("#apptMsg", m.el), "Elige un cliente registrado o escribe un nombre.");
    if (!f.date || !f.time) return setMsg($("#apptMsg", m.el), "Elige fecha y hora.");
    busy(e.submitter, async () => {
      const { error } = await sb.rpc("admin_save_appointment", {
        p_id: appt?.id || null, p_client_id: appt ? appt.client_id : client?.id || null, p_client_name: appt ? appt.client_name : (f.client_name || "").trim(),
        p_client_phone: f.client_phone || "", p_service: f.service, p_barber: f.barber, p_start: toIso(f.date, f.time),
        p_admin_notes: f.admin_notes, p_status: f.status
      });
      if (error) { setMsg($("#apptMsg", m.el), friendly(error)); free(); return; }
      m.close(); toast(appt ? "Cita actualizada." : "Cita creada."); refresh();
    });
  });
}

async function apptDetail(id) {
  const a = await q(sb.from("appointments").select("*").eq("id", id).single()).catch((e) => { toast(friendly(e), "err"); });
  if (!a) return;
  const active = ["pendiente", "confirmada"].includes(a.status);
  const m = modal(`<h2 class="modal__t">${esc(a.client_name || "Cliente")} ${statusBadge(a.status)}</h2>
    <dl class="kv">
      <dt>Servicio</dt><dd>${esc(a.service_name)} · ${durLabel(a.duration_min)}</dd>
      <dt>Precio</dt><dd>${priceLabel(a.price)}</dd>
      ${PAY_NOTE[a.status] || a.payment_method ? `<dt>Pago</dt><dd>${[PAY_NOTE[a.status], payMethod(a)].filter(Boolean).join(" · ")}</dd>` : ""}
      <dt>Barbero</dt><dd>${esc(a.barber_name)}</dd>
      <dt>Fecha</dt><dd>${esc(fmtDate(a.starts_at, { year: "numeric" }))}</dd>
      <dt>Hora</dt><dd>${fmtTime(a.starts_at)} – ${fmtTime(a.ends_at)}</dd>
      <dt>Contacto</dt><dd>${a.client_phone ? `<a href="tel:${esc(a.client_phone.replace(/[^\d+]/g, ""))}">${esc(a.client_phone)}</a> · <a href="https://wa.me/${esc(waNum(a.client_phone))}" target="_blank" rel="noopener">WhatsApp</a>` : "—"}${a.client_email ? ` · ${esc(a.client_email)}` : ""}${a.client_id ? ` · <a href="#/admin/clientes/${a.client_id}" data-close>ver cliente</a>` : " · sin cuenta"}</dd>
      <dt>Origen</dt><dd>${a.source === "admin" ? "Creada por administración" : "Reserva web"} · ${esc(fmtDateTime(a.created_at))}</dd>
      ${a.extras?.length ? `<dt>Adicionales</dt><dd>${esc(extrasText(a.extras))} · <strong>${money(extrasTotal(a.extras))}</strong></dd>` : ""}
      ${a.client_notes ? `<dt>Nota del cliente</dt><dd>${esc(a.client_notes)}</dd>` : ""}
      ${a.status === "pendiente" && a.pending_expires_at ? `<dt>Se libera</dt><dd>${esc(fmtDateTime(a.pending_expires_at))} si no se confirma</dd>` : ""}
      ${a.cancel_reason ? `<dt>Cancelación</dt><dd>${esc(a.cancel_reason)}${a.cancelled_at ? ` · ${esc(fmtDateTime(a.cancelled_at))}` : ""}</dd>` : ""}
    </dl>
    ${stepper(a, "data-st")}
    <div class="row" style="margin:18px 0">
      ${stepActions(a, "data-st")}
      ${active ? `<button class="btn btn--sm btn--ghost" data-edit>Reprogramar / editar</button><button class="btn btn--sm btn--ghost btn--danger-text" data-st="cancelada">Cancelar cita</button>` : ""}
      ${["cancelada", "completada", "no_asistio"].includes(a.status) ? `<button class="btn btn--sm btn--ghost btn--danger-text" data-del>Eliminar definitivamente</button>` : ""}
    </div>
    <form class="form" id="notesForm"><label class="field"><span>Notas internas</span><textarea name="notes" rows="2" maxlength="2000">${esc(a.admin_notes || "")}</textarea></label>
      <button class="btn btn--sm btn--ghost" type="submit">Guardar nota</button></form>`, { wide: true });
  m.el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-edit]")) { m.close(); return apptEditor({ appt: a }); }
    if (e.target.closest("[data-del]")) {
      if (!(await confirmDialog(`¿Eliminar definitivamente la cita de ${a.client_name || "este cliente"} (${fmtDate(a.starts_at)} ${fmtTime(a.starts_at)})?${a.status === "completada" ? " También se quita de finanzas y estadísticas lo que sumó." : ""} No se puede deshacer.`, "Eliminar cita", true))) return;
      const { error } = await sb.rpc("admin_delete_appointment", { p_id: a.id });
      if (error) return toast(friendly(error), "err");
      m.close(); toast("Cita eliminada."); return refresh();
    }
    const b = e.target.closest("[data-st]"); if (!b) return;
    let reason = null;
    if (b.dataset.st === "cancelada") { reason = await askText("Cancelar cita", "Motivo (opcional; lo verá el cliente)"); if (reason === null) return; }
    busy(b, async () => {
      const { error } = await sb.rpc("admin_set_status", { p_id: a.id, p_status: b.dataset.st, p_reason: reason });
      if (error) return toast(friendly(error), "err");
      m.close(); toast(stToast(b.dataset.st)); refresh();
    });
  });
  $("#notesForm", m.el).addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const { error } = await sb.rpc("admin_set_notes", { p_id: a.id, p_notes: formData(e.target).notes });
      toast(error ? friendly(error) : "Nota guardada.", error ? "err" : "ok");
    });
  });
}
function askText(title, label) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2 class="modal__t">${esc(title)}</h2><form class="form"><label class="field"><span>${esc(label)}</span><textarea name="t" rows="2" maxlength="300"></textarea></label>
      <div class="row-end"><button type="button" class="btn btn--ghost" data-close>Volver</button><button class="btn btn--danger" type="submit">Confirmar</button></div></form>`,
      { onClose: () => { if (!done) resolve(null); } });
    $("form", m.el).addEventListener("submit", (e) => { e.preventDefault(); done = true; const v = formData(e.target).t; m.close(); resolve(v); });
  });
}

/* Bloqueos / cierres / vacaciones. barberId vacío = todo el negocio. Avisa si hay citas en el rango. */
function blockEditor({ date = todayYmd(), barberId = "", fixedBarber = false, kind = "bloqueo", early = false } = {}) {
  const m = modal(`<h2 class="modal__t">${fixedBarber ? "Ausencia o vacaciones" : "Bloquear horario / cierre"}</h2>
    <form class="form" id="blkForm" novalidate>
      ${fixedBarber ? `<input type="hidden" name="barber" value="${barberId}">` : `<label class="field"><span>Aplica a</span><select name="barber"><option value="">Todo el negocio (nadie puede reservar)</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === barberId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>`}
      <label class="field"><span>Tipo</span><select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === kind ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${early ? `<p class="muted small">Horario especial: bloquea desde la hora en que se va hasta el cierre (ej.: si trabaja hasta las 6:00 p. m., de 18:00 a 20:00). Nadie podrá reservar en ese rango.</p>` : ""}
      <label class="check"><input type="checkbox" name="allday" ${early ? "" : "checked"}> Días completos</label>
      <div class="grid-2"><label class="field"><span>Desde (fecha)</span><input type="date" name="d1" required value="${date}"></label><label class="field"><span>Hasta (fecha)</span><input type="date" name="d2" required value="${date}"></label></div>
      <div class="grid-2" id="hrs" ${early ? "" : "hidden"}><label class="field"><span>Hora inicio</span><input type="time" name="t1" value="${early ? "18:00" : "12:00"}" step="300"></label><label class="field"><span>Hora fin</span><input type="time" name="t2" value="${early ? "20:00" : "13:00"}" step="300"></label></div>
      <label class="field"><span>Motivo (interno)</span><input name="reason" maxlength="200" placeholder="Ej.: festivo, capacitación, almuerzo"></label>
      <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar bloqueo</button><p class="form-msg" id="blkMsg" role="alert"></p>
    </form>`);
  const form = $("#blkForm", m.el);
  form.allday.addEventListener("change", () => { $("#hrs", m.el).hidden = form.allday.checked; });
  form.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(form);
    const s = toIso(f.d1, f.allday ? "00:00" : f.t1), en = f.allday ? toIso(addDays(f.d2, 1), "00:00") : toIso(f.d2, f.t2);
    if (!f.d1 || !f.d2 || new Date(en) <= new Date(s)) return setMsg($("#blkMsg", m.el), "El fin debe ser posterior al inicio.");
    busy(e.submitter, async () => {
      let cq = sb.from("appointments").select("id", { count: "exact", head: true }).in("status", ["pendiente", "confirmada"]).lt("starts_at", en).gt("ends_at", s);
      if (f.barber) cq = cq.eq("barber_id", f.barber);
      const { count } = await cq;
      if (count && !(await confirmDialog(`Hay ${count} cita(s) activas en ese rango. El bloqueo NO las cancela: después revísalas en la agenda y reprográmalas o cancélalas. ¿Crear el bloqueo?`, "Crear bloqueo"))) return;
      const { error } = await sb.from("time_off").insert({ barber_id: f.barber || null, starts_at: s, ends_at: en, kind: f.kind, reason: f.reason.trim() || null });
      if (error) return setMsg($("#blkMsg", m.el), friendly(error));
      m.close(); toast("Bloqueo guardado."); refresh();
    });
  });
}
async function offDetail(t) {
  if (!t) return;
  const ok = await confirmDialog(`${KIND[t.kind]}${t.barber_id ? ` de ${barberName(t.barber_id)}` : " del negocio"}: ${fmtDateTime(t.starts_at)} → ${fmtDateTime(t.ends_at)}${t.reason ? ` (${t.reason})` : ""}. ¿Eliminar este bloqueo?`, "Eliminar bloqueo", true);
  if (!ok) return;
  const { error } = await sb.from("time_off").delete().eq("id", t.id);
  toast(error ? friendly(error) : "Bloqueo eliminado.", error ? "err" : "ok"); if (!error) refresh();
}
const offsTable = (list) => list.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th></th></tr></thead><tbody>
  ${list.map((t) => `<tr><td>${KIND[t.kind]}</td><td>${esc(fmtDateTime(t.starts_at))}</td><td>${esc(fmtDateTime(t.ends_at))}</td><td>${esc(t.reason || "—")}</td><td><button class="btn btn--sm btn--ghost btn--danger-text" data-deloff="${t.id}">Eliminar</button></td></tr>`).join("")}</tbody></table></div>`
  : `<p class="muted">No hay bloqueos próximos.</p>`;
function bindOffs(root, list) {
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-deloff]"); if (b) offDetail(list.find((t) => t.id === b.dataset.deloff)); });
}

/* =============================== CITAS =============================== */
async function vCitas(_, query) {
  const page = Math.max(0, Number(query.pag || 0)), size = 50, nowIso = new Date().toISOString();
  const tab = query.estado || "proximas";
  const upcoming = (p) => p.in("status", OPEN).gte("ends_at", nowIso);
  const unclosed = (p) => p.in("status", OPEN).lt("ends_at", nowIso);   // ya pasó la hora y nadie dijo si vino
  let qa = sb.from("appointments").select("*", { count: "exact" });
  if (tab === "proximas") qa = upcoming(qa);
  else if (tab === "sincerrar") qa = unclosed(qa);
  else if (tab !== "todas") qa = qa.eq("status", tab);
  if (query.barbero) qa = qa.eq("barber_id", query.barbero);
  if (query.desde) qa = qa.gte("starts_at", toIso(query.desde, "00:00"));
  if (query.hasta) qa = qa.lt("starts_at", toIso(addDays(query.hasta, 1), "00:00"));
  if (query.q && like(query.q)) { const t = like(query.q); qa = qa.or(`client_name.ilike.%${t}%,client_phone.ilike.%${t}%,client_email.ilike.%${t}%,service_name.ilike.%${t}%`); }
  qa = qa.order("starts_at", { ascending: query.orden ? query.orden === "asc" : tab === "proximas" || tab === "pendiente" }).range(page * size, page * size + size - 1);
  const head = (st) => sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", st);
  const all = () => sb.from("appointments").select("id", { count: "exact", head: true });
  const [{ data, count, error }, cUp, cOpen, cPend, cDone, cNo, cCan] = await Promise.all([qa, upcoming(all()), unclosed(all()), head("pendiente"), head("completada"), head("no_asistio"), head("cancelada")]);
  if (error) throw error;
  const tabs = [["proximas", "Próximas", cUp.count], ["pendiente", "Por confirmar", cPend.count], ["sincerrar", "Sin cerrar", cOpen.count], ["completada", "Completadas", cDone.count], ["no_asistio", "No vinieron", cNo.count], ["cancelada", "Canceladas", cCan.count], ["todas", "Todas", null]];
  const filtered = query.q || query.barbero || query.desde || query.hasta;
  const next = tab === "proximas" && !filtered && !page ? data.find((a) => new Date(a.starts_at) > new Date()) : null;
  const rest = data;
  const days = [...new Set(rest.map((a) => ymd(new Date(a.starts_at))))];
  const mins = next ? Math.round((new Date(next.starts_at) - new Date()) / 60000) : 0;
  const html = shell("citas", "Citas", `<button class="btn btn--sm" id="newAppt" type="button">Nueva cita</button>`, `
    <nav class="ctabs" aria-label="Estado">${tabs.map(([k, v, n]) => `<a href="${hrefWith("#/admin/citas", {}, { estado: k === "proximas" ? "" : k })}" class="${k === tab ? "is-on" : k === "sincerrar" && n ? "is-warn" : ""}">${v}${n != null ? `<b>${n}</b>` : ""}</a>`).join("")}</nav>
    ${next ? `<section class="nextbar" data-appt="${next.id}" tabindex="0"><img src="${esc(apptPhoto(next))}" alt="">
      <span><small>Próxima cita · ${mins < 60 ? `en ${Math.max(mins, 0)} min` : mins < 1440 ? `en ${Math.round(mins / 60)} h` : esc(fmtDate(next.starts_at))}</small><b>${fmtTime(next.starts_at)} · ${esc(next.client_name || "Cliente")}</b></span>
      <em>${esc(next.service_name)} · ${esc(next.barber_name)}</em></section>` : ""}
    <form class="toolbar" id="fForm">
      <input type="hidden" name="estado" value="${esc(query.estado || "")}">
      <input class="grow" type="search" name="q" value="${esc(query.q || "")}" placeholder="Buscar cliente, celular, correo o servicio">
      <select name="barbero" aria-label="Barbero"><option value="">Todos los barberos</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === query.barbero ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <input type="date" name="desde" value="${esc(query.desde || "")}" aria-label="Desde"><input type="date" name="hasta" value="${esc(query.hasta || "")}" aria-label="Hasta">
      <button class="btn btn--sm" type="submit">Filtrar</button>${filtered ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/citas", {}, { estado: query.estado })}">Limpiar</a>` : ""}
    </form>
    ${days.map((d) => { const list = rest.filter((a) => ymd(new Date(a.starts_at)) === d);
      return `<section class="cday"><header><b>${+d.slice(8)}</b><span>${esc(cap(fmtDay(d, { weekday: "long" })))}<small>${esc(fmtDay(d, { month: "long", year: "numeric" }))} · ${list.length} cita${list.length > 1 ? "s" : ""}</small></span>${d === todayYmd() ? `<em>Hoy</em>` : ""}</header>
        <div class="agrid">${list.map((a) => apptCard(a)).join("")}</div></section>`; }).join("")}
    ${data.length ? `<div class="pager"><span>${page * size + 1}–${page * size + data.length} de ${count}</span><span class="row">
      ${page > 0 ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/citas", query, { pag: page - 1 })}">Anterior</a>` : ""}
      ${(page + 1) * size < count ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/citas", query, { pag: page + 1 })}">Siguiente</a>` : ""}</span></div>`
    : emptyState(tab === "sincerrar" && !filtered ? "Todas las citas están al día." : tab === "proximas" && !filtered ? "No hay citas próximas." : "No hay citas con esos filtros.")}`);
  const mount = () => {
    $("#newAppt").addEventListener("click", () => apptEditor({}));
    $("#fForm").addEventListener("submit", (e) => { e.preventDefault(); go(hrefWith("#/admin/citas", {}, formData(e.target))); });
    bindAppts($(".adm__main"));
  };
  return { html, mount };
}

/* =============================== SERVICIOS =============================== */
async function vServicios(_, query) {
  const cats = State.categories;
  const catName = (id) => cats.find((c) => c.id === id)?.name || "Sin categoría";
  let list = State.services.filter((s) => !s.deleted_at);
  if (query.f === "sinprecio") list = list.filter((s) => s.price == null);
  const html = shell("servicios", "Servicios", `<button class="btn btn--sm btn--ghost" id="newCat" type="button">Nueva categoría</button><button class="btn btn--sm" id="newSvc" type="button">Nuevo servicio</button>`, `
    <div class="toolbar"><div class="seg"><a href="#/admin/servicios" class="${query.f ? "" : "is-on"}">Todos</a><a href="#/admin/servicios?f=sinprecio" class="${query.f ? "is-on" : ""}">Sin precio</a></div></div>
    ${list.length ? `<div class="sgrid">${list.map((s) => `<article class="scard${s.active ? "" : " is-off"}">
        <div class="scard__pic"><img src="${esc(svcPhoto(s))}" alt="" loading="lazy"><span class="scard__price${s.price == null ? " is-none" : ""}">${s.price == null ? "Sin precio" : money(s.price)}</span>${s.active ? "" : `<span class="scard__off">Oculto</span>`}</div>
        <div class="scard__body"><small>${esc(catName(s.category_id))} · ${durLabel(s.duration_min)}</small><h3>${esc(s.name)}</h3>${s.description ? `<p class="muted">${esc(s.description.slice(0, 90))}</p>` : ""}
          <div class="scard__acts"><button class="btn btn--sm" data-edit="${s.id}">Editar</button><button class="btn btn--sm btn--ghost" data-toggle="${s.id}">${s.active ? "Ocultar" : "Publicar"}</button><button class="btn btn--sm btn--ghost btn--danger-text" data-del="${s.id}">Eliminar</button></div></div></article>`).join("")}</div>`
      : emptyState(query.f ? "Todos los servicios tienen precio." : "Aún no hay servicios.", query.f ? "" : "Crea el primero con “Nuevo servicio”.")}
    <div class="card" style="margin-top:18px"><h2>Categorías</h2>
      ${cats.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Orden</th><th>Estado</th><th></th></tr></thead><tbody>${cats.map((c) => `<tr class="${c.active ? "" : "off"}"><td>${esc(c.name)}</td><td>${c.sort_order}</td><td>${c.active ? "Visible" : "Oculta"}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn btn--sm btn--ghost" data-ecat="${c.id}">Editar</button><button class="btn btn--sm btn--ghost btn--danger-text" data-dcat="${c.id}">Eliminar</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Sin categorías: los servicios se muestran en una sola lista.</p>`}</div>`);
  const mount = () => {
    $("#newSvc").addEventListener("click", () => serviceEditor());
    $("#newCat").addEventListener("click", () => catEditor());
    $(".adm__main").addEventListener("click", async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const d = t.dataset;
      if (d.edit) serviceEditor(State.services.find((s) => s.id === d.edit));
      if (d.ecat) catEditor(cats.find((c) => c.id === d.ecat));
      if (d.toggle) { const s = State.services.find((x) => x.id === d.toggle); await save(sb.from("services").update({ active: !s.active }).eq("id", s.id), s.active ? "Servicio oculto." : "Servicio publicado."); }
      if (d.del && await confirmDialog("¿Eliminar este servicio? Se oculta de la web y del panel, pero las citas históricas conservan su nombre, duración y precio.", "Eliminar", true))
        await save(sb.from("services").update({ deleted_at: new Date().toISOString(), active: false }).eq("id", d.del), "Servicio eliminado.");
      if (d.dcat && await confirmDialog("¿Eliminar la categoría? Sus servicios quedarán sin categoría.", "Eliminar", true))
        await save(sb.from("service_categories").delete().eq("id", d.dcat), "Categoría eliminada.");
    });
  };
  return { html, mount };
}
async function save(p, okMsg) { const { error } = await p; toast(error ? friendly(error) : okMsg, error ? "err" : "ok"); if (!error) refresh(); return !error; }
const imgField = (name, url, label) => `<div class="field"><span>${label}</span><div class="img-field">${safeUrl(url) ? `<img src="${esc(url)}" alt="">` : ""}
  <input type="file" name="${name}" accept="image/jpeg,image/png,image/webp">${url ? `<label class="check small"><input type="checkbox" name="${name}_quitar"> Quitar</label>` : ""}</div></div>`;
async function imgValue(form, name, current, folder) {
  const file = form[name]?.files?.[0];
  if (file) return uploadImage(file, folder);
  return form[`${name}_quitar`]?.checked ? null : current || null;
}

function serviceEditor(s = null) {
  const m = modal(`<h2 class="modal__t">${s ? "Editar servicio" : "Nuevo servicio"}</h2>
    <form class="form" id="svcForm" novalidate>
      <label class="field"><span>Nombre</span><input name="name" required maxlength="80" value="${esc(s?.name)}"></label>
      <label class="field"><span>Descripción</span><textarea name="description" rows="3" maxlength="600">${esc(s?.description)}</textarea></label>
      <div class="grid-2">
        <label class="field"><span>Categoría</span><select name="category_id"><option value="">Sin categoría</option>${State.categories.map((c) => `<option value="${c.id}" ${c.id === s?.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Duración (minutos)</span><input type="number" name="duration_min" required min="5" max="480" step="5" value="${s?.duration_min ?? 35}"></label>
        <label class="field"><span>Precio en COP (vacío = por definir)</span><input type="number" name="price" min="0" step="100" value="${s?.price ?? ""}" inputmode="numeric"></label>
        <label class="field"><span>Orden</span><input type="number" name="sort_order" value="${s?.sort_order ?? 0}"></label>
      </div>
      ${imgField("image", s?.image_url, "Imagen (opcional)")}
      <label class="check"><input type="checkbox" name="active" ${s?.active === false ? "" : "checked"}> Publicado (visible y reservable)</label>
      ${s ? `<p class="muted small">Cambiar duración o precio no altera las citas ya reservadas: cada cita guarda los valores del momento.</p>` : ""}
      <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="svcMsg" role="alert"></p>
    </form>`, { wide: true });
  $("#svcForm", m.el).addEventListener("submit", (e) => {
    e.preventDefault(); const form = e.target, f = formData(form);
    const dur = Number(f.duration_min);
    if (!f.name.trim()) return setMsg($("#svcMsg", m.el), "Escribe el nombre.");
    if (!(dur >= 5 && dur <= 480)) return setMsg($("#svcMsg", m.el), "La duración debe estar entre 5 y 480 minutos.");
    if (f.price !== "" && !(Number(f.price) >= 0)) return setMsg($("#svcMsg", m.el), "Precio no válido.");
    busy(e.submitter, async () => {
      try {
        const row = { name: f.name.trim(), description: f.description.trim() || null, category_id: f.category_id || null, duration_min: dur,
          price: f.price === "" ? null : Number(f.price), sort_order: Number(f.sort_order) || 0, active: form.active.checked,
          image_url: await imgValue(form, "image", s?.image_url, "servicios") };
        const { error } = s ? await sb.from("services").update(row).eq("id", s.id) : await sb.from("services").insert(row);
        if (error) throw error;
        m.close(); toast("Servicio guardado."); refresh();
      } catch (err) { setMsg($("#svcMsg", m.el), err.message?.startsWith("Formato") || err.message?.startsWith("La imagen") ? err.message : friendly(err)); }
    });
  });
}
function catEditor(c = null) {
  const m = modal(`<h2 class="modal__t">${c ? "Editar categoría" : "Nueva categoría"}</h2><form class="form" id="catForm">
    <label class="field"><span>Nombre</span><input name="name" required maxlength="60" value="${esc(c?.name)}"></label>
    <label class="field"><span>Orden</span><input type="number" name="sort_order" value="${c?.sort_order ?? 0}"></label>
    <label class="check"><input type="checkbox" name="active" ${c?.active === false ? "" : "checked"}> Visible</label>
    <button class="btn btn--block" type="submit">Guardar</button><p class="form-msg" id="catMsg"></p></form>`);
  $("#catForm", m.el).addEventListener("submit", async (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (!f.name.trim()) return setMsg($("#catMsg", m.el), "Escribe el nombre.");
    const row = { name: f.name.trim(), sort_order: Number(f.sort_order) || 0, active: e.target.active.checked };
    if (await save(c ? sb.from("service_categories").update(row).eq("id", c.id) : sb.from("service_categories").insert(row), "Categoría guardada.")) m.close();
  });
}

/* =============================== BARBEROS =============================== */
async function vBarberos(id) {
  if (id) return vBarbero(id);
  const list = State.barbers.filter((b) => !b.deleted_at);
  const html = shell("barberos", "Barberos", `<button class="btn btn--sm" id="newBarber" type="button">Nuevo barbero</button>`, list.length ? `
    <div class="table-wrap"><table><thead><tr><th></th><th>Nombre</th><th>Especialidades</th><th>Horario</th><th>Estado</th><th></th></tr></thead><tbody>
    ${list.map((b) => `<tr class="${b.active ? "" : "off"}"><td>${safeUrl(b.photo_url) ? `<img class="thumb" src="${esc(b.photo_url)}" alt="">` : `<span class="thumb" style="display:block"></span>`}</td>
      <td><a href="#/admin/barberos/${b.id}"><strong>${esc(b.name)}</strong></a></td><td>${esc((b.specialties || []).join(", ") || "—")}</td>
      <td>${State.schedules.some((s) => s.barber_id === b.id) ? "Propio" : "General del negocio"}</td><td>${b.active ? "Activo" : "Inactivo"}</td>
      <td class="row" style="flex-wrap:nowrap"><a class="btn btn--sm btn--ghost" href="#/admin/barberos/${b.id}">Horario y citas</a><button class="btn btn--sm btn--ghost" data-edit="${b.id}">Editar</button></td></tr>`).join("")}
    </tbody></table></div>` : emptyState("Aún no hay barberos.", "Crea el primero con “Nuevo barbero”."));
  const mount = () => {
    $("#newBarber").addEventListener("click", () => barberEditor());
    $(".adm__main").addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) barberEditor(State.barbers.find((x) => x.id === b.dataset.edit)); });
  };
  return { html, mount };
}
function barberEditor(b = null) {
  const m = modal(`<h2 class="modal__t">${b ? "Editar barbero" : "Nuevo barbero"}</h2>
    <form class="form" id="barForm" novalidate>
      <label class="field"><span>Nombre</span><input name="name" required maxlength="80" value="${esc(b?.name)}"></label>
      <label class="field"><span>Especialidades (separadas por coma)</span><input name="specialties" maxlength="300" value="${esc((b?.specialties || []).join(", "))}" placeholder="Ej.: fade, barba, diseño"></label>
      <label class="field"><span>Descripción</span><textarea name="bio" rows="3" maxlength="600">${esc(b?.bio)}</textarea></label>
      <label class="field"><span>Orden</span><input type="number" name="sort_order" value="${b?.sort_order ?? 0}"></label>
      ${imgField("photo", b?.photo_url, "Fotografía")}
      <label class="check"><input type="checkbox" name="active" ${b?.active === false ? "" : "checked"}> Activo (recibe reservas)</label>
      <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="barMsg" role="alert"></p>
      ${b ? `<button class="btn btn--ghost btn--danger-text btn--block" type="button" id="delBarber">Eliminar barbero</button>` : ""}
    </form>`, { wide: true });
  const form = $("#barForm", m.el);
  const futureCount = async () => b ? (await sb.from("appointments").select("id", { count: "exact", head: true }).eq("barber_id", b.id).in("status", ["pendiente", "confirmada"]).gte("starts_at", new Date().toISOString())).count || 0 : 0;
  form.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(form);
    if (!f.name.trim()) return setMsg($("#barMsg", m.el), "Escribe el nombre.");
    busy(e.submitter, async () => {
      try {
        if (b?.active && !form.active.checked) {
          const n = await futureCount();
          if (n && !(await confirmDialog(`${b.name} tiene ${n} cita(s) próximas. Al desactivarlo no recibirá reservas nuevas, pero esas citas siguen activas: reprográmalas o cancélalas en la agenda. ¿Continuar?`, "Desactivar"))) return;
        }
        const row = { name: f.name.trim(), bio: f.bio.trim() || null, sort_order: Number(f.sort_order) || 0, active: form.active.checked,
          specialties: f.specialties.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12),
          photo_url: await imgValue(form, "photo", b?.photo_url, "barberos") };
        const { error } = b ? await sb.from("barbers").update(row).eq("id", b.id) : await sb.from("barbers").insert(row);
        if (error) throw error;
        m.close(); toast("Barbero guardado."); refresh();
      } catch (err) { setMsg($("#barMsg", m.el), /^(Formato|La imagen)/.test(err.message) ? err.message : friendly(err)); }
    });
  });
  $("#delBarber", m.el)?.addEventListener("click", async () => {
    const n = await futureCount();
    if (n) return setMsg($("#barMsg", m.el), `Tiene ${n} cita(s) próximas. Reprográmalas o cancélalas antes de eliminarlo.`);
    if (!(await confirmDialog("¿Eliminar este barbero? Su historial de citas se conserva.", "Eliminar", true))) return;
    if (await save(sb.from("barbers").update({ deleted_at: new Date().toISOString(), active: false }).eq("id", b.id), "Barbero eliminado.")) { m.close(); go("#/admin/barberos"); }
  });
}
async function vBarbero(id) {
  const b = State.barbers.find((x) => x.id === id);
  if (!b) return { html: shell("barberos", "Barbero no encontrado", "", emptyState("No existe.", "", `<a class="btn" href="#/admin/barberos">Volver</a>`)) };
  const now = new Date().toISOString();
  const [offs, next] = await Promise.all([
    q(sb.from("time_off").select("*").eq("barber_id", id).gt("ends_at", now).order("starts_at")),
    q(sb.from("appointments").select("*").eq("barber_id", id).in("status", ["pendiente", "confirmada"]).gte("starts_at", now).order("starts_at").limit(30))
  ]);
  const html = shell("barberos", esc(b.name), `<a class="btn btn--sm btn--ghost" href="#/admin/agenda?barbero=${id}&vista=semana">Ver en agenda</a><button class="btn btn--sm btn--ghost" id="editB" type="button">Editar perfil</button>`, `
    ${b.active ? "" : `<div class="notice notice--warn">Barbero inactivo: no recibe reservas nuevas.</div>`}
    <div class="card"><h2>Horario semanal propio</h2>
      <p class="muted small">Si no defines franjas, ${esc(b.name)} trabaja el horario general del negocio. Si las defines, solo trabaja esos días y horas (siempre dentro del horario del negocio). El espacio entre dos franjas del mismo día es una pausa (p. ej. almuerzo).</p>
      <div id="sched"></div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h2>Vacaciones, ausencias y bloqueos</h2><button class="btn btn--sm btn--ghost" id="addOff" type="button">Agregar</button></div><div id="offs">${offsTable(offs)}</div></div>
    <div class="card" style="margin-top:14px"><h2>Próximas citas</h2>${next.length ? `<div class="table-wrap"><table><tbody>${next.map((a) => `<tr class="click" data-appt="${a.id}"><td>${esc(fmtDate(a.starts_at))} · ${fmtTime(a.starts_at)}</td><td>${esc(a.client_name)}</td><td>${esc(a.service_name)}</td><td>${statusBadge(a.status)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Sin citas próximas.</p>`}</div>`);
  const mount = () => {
    scheduleEditor($("#sched"), id);
    $("#editB").addEventListener("click", () => barberEditor(b));
    $("#addOff").addEventListener("click", () => blockEditor({ barberId: id, fixedBarber: true, kind: "vacaciones" }));
    bindOffs($("#offs"), offs);
    $(".adm__main").addEventListener("click", (e) => { const r = e.target.closest("[data-appt]"); if (r) apptDetail(r.dataset.appt); });
  };
  return { html, mount };
}

/* Editor de horario semanal (barberId null = negocio). Inserta las franjas nuevas
   y solo después borra las anteriores, para no perder el horario si algo falla. */
function scheduleEditor(el, barberId) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const old = State.schedules.filter((s) => (s.barber_id || null) === barberId);
  const ranges = Object.fromEntries(order.map((d) => [d, old.filter((s) => s.weekday === d).map((s) => [shortTime(s.start_time), shortTime(s.end_time)])]));
  const render = () => {
    el.innerHTML = `<div class="sched">${order.map((d) => `<div class="sched__day"><strong>${DAYS[d]}</strong><div class="sched__ranges">
      ${ranges[d].map(([a, b], i) => `<span class="range"><input type="time" step="300" value="${a}" data-d="${d}" data-i="${i}" data-k="0" aria-label="${DAYS[d]} inicio"> – <input type="time" step="300" value="${b}" data-d="${d}" data-i="${i}" data-k="1" aria-label="${DAYS[d]} fin"><button type="button" data-rm="${d}|${i}" aria-label="Quitar franja">×</button></span>`).join("") || `<span class="muted small">${barberId ? "No trabaja" : "Cerrado"}</span>`}
      <button type="button" class="btn btn--sm btn--ghost" data-add="${d}">+ Franja</button></div></div>`).join("")}</div>
      <div class="row" style="margin-top:14px"><button class="btn" type="button" data-save data-busy="Guardando…">Guardar horario</button>
      ${barberId ? `<button class="btn btn--ghost" type="button" data-reset>Usar horario general</button>` : ""}<span class="form-msg" id="schMsg"></span></div>`;
  };
  el.addEventListener("input", (e) => { const t = e.target; if (t.dataset.d) ranges[t.dataset.d][t.dataset.i][t.dataset.k] = t.value; });
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.add) { const r = ranges[t.dataset.add]; const last = r.at(-1); r.push(last ? [last[1], last[1] < "23:00" ? `${String(+last[1].slice(0, 2) + 1).padStart(2, "0")}${last[1].slice(2)}` : "23:59"] : ["09:00", "19:00"]); return render(); }
    if (t.dataset.rm) { const [d, i] = t.dataset.rm.split("|"); ranges[d].splice(i, 1); return render(); }
    if (t.dataset.reset) {
      if (!(await confirmDialog("¿Quitar el horario propio? Trabajará el horario general del negocio.", "Quitar"))) return;
      return save(sb.from("schedules").delete().eq("barber_id", barberId), "Ahora usa el horario general.");
    }
    if (t.dataset.save !== undefined) {
      for (const d of order) {
        const r = [...ranges[d]].sort((a, b) => a[0].localeCompare(b[0]));
        for (let i = 0; i < r.length; i++) {
          if (!r[i][0] || !r[i][1] || r[i][1] <= r[i][0]) return setMsg($("#schMsg", el), `${DAYS[d]}: la hora de fin debe ser posterior a la de inicio.`);
          if (i && r[i][0] < r[i - 1][1]) return setMsg($("#schMsg", el), `${DAYS[d]}: hay franjas que se cruzan.`);
        }
      }
      busy(t, async () => {
        const rows = order.flatMap((d) => ranges[d].map(([a, b]) => ({ barber_id: barberId, weekday: d, start_time: a, end_time: b })));
        if (rows.length) { const { error } = await sb.from("schedules").insert(rows); if (error) return setMsg($("#schMsg", el), friendly(error)); }
        if (old.length) { const { error } = await sb.from("schedules").delete().in("id", old.map((s) => s.id)); if (error) return setMsg($("#schMsg", el), friendly(error)); }
        toast("Horario guardado. Las citas ya reservadas no cambian."); refresh();
      });
    }
  });
  render();
}

/* =============================== HORARIOS Y CIERRES =============================== */
async function vHorarios() {
  const offs = await q(sb.from("time_off").select("*").is("barber_id", null).gt("ends_at", new Date().toISOString()).order("starts_at"));
  const r = State.settings.reservas || {};
  const html = shell("horarios", "Horarios y cierres", "", `
    <div class="card"><h2>Horario general del negocio</h2>
      <p class="muted small">Define cuándo abre la barbería. Cada barbero puede tener un horario propio dentro de este (en Barberos). Deja un día sin franjas para marcarlo como día de descanso; usa dos franjas para una pausa.</p>
      <div id="sched"></div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h2>Cierres, festivos y días no laborables</h2><span class="row"><button class="btn btn--sm btn--ghost" id="addEarly" type="button">Horario especial de un día</button><button class="btn btn--sm" id="addClose" type="button">Agregar cierre</button></span></div>
      <div id="offs">${offsTable(offs)}</div></div>
    <div class="card" style="margin-top:14px"><h2>Reglas de reserva vigentes</h2>
      <dl class="kv"><dt>Intervalo entre horas de inicio</dt><dd>${r.intervalo_min ?? 35} min</dd><dt>Anticipación mínima</dt><dd>${r.anticipacion_min_minutos ?? 60} min</dd>
      <dt>Anticipación máxima</dt><dd>${r.anticipacion_max_dias ?? 30} días</dd><dt>Cancelar/reprogramar hasta</dt><dd>${r.cancelacion_min_horas ?? 2} h antes</dd></dl>
      <p style="margin-top:12px"><a class="link-arrow" href="#/admin/configuracion/reservas">Cambiar reglas</a></p></div>`);
  const mount = () => {
    scheduleEditor($("#sched"), null);
    $("#addClose").addEventListener("click", () => blockEditor({ kind: "cierre" }));
    $("#addEarly").addEventListener("click", () => blockEditor({ early: true }));
    bindOffs($("#offs"), offs);
  };
  return { html, mount };
}

/* =============================== CLIENTES =============================== */
async function vClientes(id, query) {
  if (id) return vCliente(id);
  const seg = query.seg || "todos", now = Date.now(), DAY = 864e5, size = 48, page = Math.max(0, Number(query.pag || 0));
  // shortcut: trae hasta 1000 cuentas y 5000 citas y filtra en el navegador; pasar a una función SQL si el negocio supera eso.
  const [profiles, appts] = await Promise.all([
    q(sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000)),
    q(sb.from("appointments").select("id,client_id,client_name,client_phone,client_email,status,starts_at,price,extras,service_name,barber_name").order("starts_at", { ascending: false }).limit(5000))
  ]);
  const summarize = (list) => {
    const done = list.filter((a) => a.status === "completada"), active = list.filter((a) => ["pendiente", "confirmada"].includes(a.status) && new Date(a.starts_at) > now);
    return { total: list.length, done: done.length, spent: done.reduce((t, a) => t + apptTotal(a), 0), last: done[0]?.starts_at || null, next: active.at(-1)?.starts_at || null };
  };
  const clients = profiles.map((p) => ({ id: p.id, name: p.full_name || p.email || "(sin nombre)", email: p.email, phone: p.phone, role: p.role, created: p.created_at, ...summarize(appts.filter((a) => a.client_id === p.id)) }));
  const groups = {};
  appts.filter((a) => !a.client_id).forEach((a) => { const k = (a.client_email || "").toLowerCase() || String(a.client_phone || "").replace(/\D/g, "") || a.client_name; (groups[k] ||= []).push(a); });
  const guests = Object.entries(groups).map(([k, l]) => ({ guest: k, name: l[0].client_name || "Invitado", email: l[0].client_email, phone: l[0].client_phone, ...summarize(l) }));
  const inactive = (c) => c.last && !c.next && now - new Date(c.last) > 45 * DAY;
  const SEGS = [["todos", "Todos", () => true], ["proxima", "Con cita próxima", (c) => c.next], ["frecuentes", "Frecuentes", (c) => c.done >= 3], ["inactivos", "Sin volver 45+ días", inactive], ["nuevos", "Nuevos", (c) => now - new Date(c.created) < 30 * DAY]];
  const isGuests = seg === "invitados";
  const t = (query.q || "").trim().toLowerCase();
  const match = (c) => !t || [c.name, c.email, c.phone].some((v) => String(v || "").toLowerCase().includes(t));
  const pool = isGuests ? guests : clients.filter((SEGS.find(([k]) => k === seg) || SEGS[0])[2]);
  const shown = pool.filter(match).sort((a, b) => b.total - a.total);
  const ROLES = { client: "Cliente", admin: "Administrador", barber: "Barbero" };
  const card = (c) => `<article class="ucard" ${c.id ? `data-cli="${c.id}"` : `data-guest="${esc(c.guest)}"`} tabindex="0">
    <header>${avatar(c.name)}<div><h3>${esc(c.name)}</h3><small>${esc(c.phone || c.email || "Sin contacto")}</small></div>${c.role && c.role !== "client" ? `<em>${ROLES[c.role]}</em>` : ""}${c.id ? "" : `<em>Invitado</em>`}</header>
    <dl><div><dt>Reservas</dt><dd>${c.total}</dd></div><div><dt>Atendidas</dt><dd>${c.done}</dd></div><div><dt>Ha pagado</dt><dd>${money(c.spent)}</dd></div></dl>
    <p class="ucard__next ${c.next ? "is-next" : ""}">${c.next ? `Próxima cita: ${esc(fmtDate(c.next, { weekday: "short" }))} · ${fmtTime(c.next)}` : c.last ? `Última visita: ${esc(fmtDate(c.last, { weekday: undefined, year: "numeric" }))}` : "Aún sin visitas"}</p>
    <div class="ucard__acts"><button class="btn btn--sm" type="button" data-new-for>Nueva cita</button>${c.phone ? `<a class="btn btn--sm btn--ghost" href="${waLinkTo(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div></article>`;
  const html = shell("clientes", "Clientes", `<a class="btn btn--sm btn--ghost" href="#/admin/consentimientos">Aceptaciones legales</a>`, `
    <div class="kpis">
      <div class="kpi"><span>Clientes con cuenta</span><strong>${clients.filter((c) => c.role === "client").length}</strong><small>+${clients.filter((c) => now - new Date(c.created) < 30 * DAY).length} en 30 días</small></div>
      <div class="kpi"><span>Invitados</span><strong>${guests.length}</strong><small>reservaron sin cuenta</small></div>
      <div class="kpi"><span>Con cita próxima</span><strong>${clients.concat(guests).filter((c) => c.next).length}</strong><small>por atender</small></div>
      <div class="kpi"><span>Sin volver</span><strong>${clients.concat(guests).filter(inactive).length}</strong><small>más de 45 días</small></div>
    </div>
    <nav class="ctabs" aria-label="Segmentos">${SEGS.map(([k, v]) => [k, v]).concat([["invitados", "Invitados"]]).map(([k, v]) => `<a href="${hrefWith("#/admin/clientes", {}, { seg: k === "todos" ? "" : k, q: query.q })}" class="${k === seg ? "is-on" : ""}">${v}</a>`).join("")}</nav>
    <form class="toolbar" id="fForm"><input type="hidden" name="seg" value="${esc(query.seg || "")}"><input class="grow" type="search" name="q" value="${esc(query.q || "")}" placeholder="Buscar por nombre, correo o celular"><button class="btn btn--sm" type="submit">Buscar</button></form>
    ${shown.length ? `<div class="ugrid">${shown.slice(page * size, page * size + size).map(card).join("")}</div>
    <div class="pager"><span>${page * size + 1}–${Math.min(shown.length, (page + 1) * size)} de ${shown.length}</span><span class="row">
      ${page > 0 ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/clientes", query, { pag: page - 1 })}">Anterior</a>` : ""}
      ${(page + 1) * size < shown.length ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/clientes", query, { pag: page + 1 })}">Siguiente</a>` : ""}</span></div>`
    : emptyState("No hay clientes aquí.")}`);
  const mount = () => {
    $("#fForm").addEventListener("submit", (e) => { e.preventDefault(); go(hrefWith("#/admin/clientes", {}, formData(e.target))); });
    const act = (e) => {
      if (e.target.closest("a")) return;
      const r = e.target.closest("[data-cli],[data-guest]"); if (!r || (e.type === "keydown" && (e.key !== "Enter" || e.target !== r))) return;
      const g = r.dataset.guest != null ? guests.find((x) => x.guest === r.dataset.guest) : null;
      const c = g || clients.find((x) => x.id === r.dataset.cli);
      if (e.target.closest("[data-new-for]")) return g ? apptEditor({ walkName: g.name, walkPhone: g.phone || "" }) : apptEditor({ clientId: c.id, clientName: c.name });
      if (!g) { location.hash = `#/admin/clientes/${c.id}`; return; }
      const m = modal(`<h2 class="modal__t">${esc(g.name)} <small class="muted">invitado</small></h2><p class="muted">${esc([g.email, g.phone].filter(Boolean).join(" · "))}</p>
        <div class="glist">${groups[g.guest].map((a) => `<button type="button" class="pick" data-appt="${a.id}"><span class="pick__main"><strong>${esc(fmtDate(a.starts_at, { weekday: "short", year: "numeric" }))} · ${fmtTime(a.starts_at)}</strong><small>${esc(a.service_name)} · ${esc(a.barber_name)} · ${esc(STATUS[a.status])}</small></span></button>`).join("")}</div>`, { wide: true });
      m.el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-appt]"); if (b) { m.close(); apptDetail(b.dataset.appt); } });
    };
    $(".adm__main").addEventListener("click", act); $(".adm__main").addEventListener("keydown", act);
  };
  return { html, mount };
}
async function vCliente(id) {
  const [p, appts, notes] = await Promise.all([
    q(sb.from("profiles").select("*").eq("id", id).single()),
    q(sb.from("appointments").select("*").eq("client_id", id).order("starts_at", { ascending: false }).limit(200)),
    q(sb.from("client_admin_notes").select("*").eq("client_id", id).maybeSingle())
  ]);
  const self = id === State.user.id;
  const done = appts.filter((a) => a.status === "completada");
  const next = appts.filter((a) => ["pendiente", "confirmada"].includes(a.status) && new Date(a.starts_at) > new Date()).at(-1);
  const top = (arr) => Object.entries(arr.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favS = top(done.flatMap((a) => a.services?.length ? a.services.map((s) => s.n) : [a.service_name])), favB = top(done.map((a) => a.barber_name));
  const html = shell("clientes", "Cliente", `<a class="btn btn--sm btn--ghost" href="#/admin/clientes">Todos los clientes</a>`, `
    <section class="uhero">${avatar(p.full_name || p.email)}<div><h2>${esc(p.full_name || p.email)}</h2><p>${esc([p.phone, p.email].filter(Boolean).join(" · ") || "Sin contacto")}</p><small>Cliente desde ${esc(fmtDate(p.created_at, { weekday: undefined, year: "numeric" }))}</small></div>
      <div class="uhero__acts"><button class="btn btn--sm btn--light" id="newAppt" type="button">Nueva cita</button>${p.phone ? `<a class="btn btn--sm btn--light" href="${waLinkTo(p.phone)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn--sm btn--light" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">Llamar</a>` : ""}${p.email ? `<a class="btn btn--sm btn--light" href="mailto:${esc(p.email)}">Correo</a>` : ""}</div></section>
    <div class="kpis">
      <div class="kpi"><span>Reservas</span><strong>${appts.length}</strong><small>${appts.filter((a) => a.status === "cancelada").length} canceladas · ${appts.filter((a) => a.status === "no_asistio").length} no vino</small></div>
      <div class="kpi"><span>Atendidas</span><strong>${done.length}</strong><small>${done[0] ? `última: ${esc(fmtDate(done[0].starts_at, { weekday: undefined }))}` : "aún sin visitas"}</small></div>
      <div class="kpi"><span>Ha pagado</span><strong>${money(done.reduce((t, a) => t + apptTotal(a), 0))}</strong><small>en citas atendidas</small></div>
      <div class="kpi"><span>Le gusta</span><strong class="kpi__txt">${esc(favS || "—")}</strong><small>${favB ? `con ${esc(favB)}` : "aún sin datos"}</small></div>
    </div>
    ${next ? `<h2 class="uh">Próxima cita</h2><div class="agrid">${apptCard(next, { client: false })}</div>` : ""}
    <h2 class="uh">Historial</h2>${appts.length ? `<div class="agrid">${appts.filter((a) => a !== next).map((a) => apptCard(a, { client: false })).join("")}</div>` : `<p class="muted">Sin citas.</p>`}
    <div class="cards-2" style="margin-top:22px">
      <div class="card"><h2>Notas internas</h2><form class="form" id="noteForm"><textarea name="notes" rows="4" maxlength="2000" placeholder="Preferencias, observaciones… (solo administración)">${esc(notes?.notes || "")}</textarea>
        <button class="btn btn--sm" type="submit">Guardar nota</button></form></div>
      <div class="card"><h2>Rol y acceso</h2>
      ${self ? `<p class="muted">Este es tu usuario. Para evitar perder el acceso, otro administrador debe cambiar tu rol.</p>` : `
      <form class="toolbar" id="roleForm"><select name="role" aria-label="Rol"><option value="client" ${p.role === "client" ? "selected" : ""}>Cliente</option><option value="barber" ${p.role === "barber" ? "selected" : ""}>Barbero (ve su agenda en Mi cuenta)</option><option value="admin" ${p.role === "admin" ? "selected" : ""}>Administrador (acceso total)</option></select>
        <select name="barber_id" aria-label="Perfil de barbero"><option value="">— Perfil de barbero —</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === p.barber_id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
        <button class="btn btn--sm btn--ghost" type="submit">Guardar rol</button></form>`}</div>
    </div>`);
  const mount = () => {
    $("#newAppt").addEventListener("click", () => apptEditor({ clientId: p.id, clientName: p.full_name || p.email }));
    bindAppts($(".adm__main"));
    $("#noteForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.from("client_admin_notes").upsert({ client_id: id, notes: formData(e.target).notes.trim(), updated_by: State.user.id, updated_at: new Date().toISOString() });
      toast(error ? friendly(error) : "Nota guardada.", error ? "err" : "ok");
    });
    $("#roleForm")?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = formData(e.target);
      if (f.role === "barber" && !f.barber_id) return toast("Elige qué perfil de barbero corresponde a esta cuenta.", "err");
      if (f.role === "admin" && !(await confirmDialog(`¿Dar acceso de ADMINISTRADOR a ${p.email}? Podrá ver y modificar todo el negocio.`, "Sí, hacer administrador", true))) return;
      save(sb.from("profiles").update({ role: f.role, barber_id: f.role === "barber" ? f.barber_id : null }).eq("id", id), "Rol actualizado.");
    });
  };
  return { html, mount };
}

/* =============================== CONFIGURACIÓN =============================== */
async function vConfig(tab = "negocio") {
  const n = State.settings.negocio || {}, r = State.settings.reservas || {};
  const tabs = [["negocio", "Negocio y contacto"], ["marca", "Identidad visual"], ["reservas", "Reglas de reserva"], ["galeria", "Galería"]];
  const field = (k, label, attrs = "") => `<label class="field"><span>${label}</span><input name="${k}" value="${esc(n[k] || "")}" ${attrs}></label>`;
  const num = (k, label, min, max, def) => `<label class="field"><span>${label}</span><input type="number" name="${k}" min="${min}" max="${max}" required value="${r[k] ?? def}"></label>`;
  let body = "";
  if (tab === "negocio") body = `<form class="form card" id="cfgForm" data-key="negocio">
    <div class="grid-2">${field("nombre", "Nombre comercial", "maxlength=80 required")}${field("nombre_largo", "Nombre largo (opcional)", "maxlength=120")}
      ${field("eslogan", "Eslogan", "maxlength=120")}${field("ciudad", "Ciudad", "maxlength=80")}</div>
    ${field("direccion", "Dirección", "maxlength=200")}
    <div class="grid-2">${field("mapa_url", "Enlace de Google Maps (opcional)", "type=url placeholder='https://maps.app.goo.gl/…'")}${field("telefono", "Teléfono / celular", "maxlength=30")}
      ${field("whatsapp_url", "Enlace de WhatsApp", "type=url")}${field("correo", "Correo de contacto", "type=email")}
      ${field("instagram", "Instagram", "type=url")}${field("facebook", "Facebook", "type=url")}${field("tiktok", "TikTok", "type=url")}</div>
    <h3 class="h-sec">Datos legales (aparecen en Términos y Política de privacidad)</h3>
    <div class="grid-2">${field("titular", "Nombre del propietario o razón social", "maxlength=120")}${field("nit", "NIT o cédula", "maxlength=30")}</div>
    <h3 class="h-sec">Textos de la web</h3>
    ${field("hero_titulo", "Título principal (portada)", "maxlength=120 placeholder='Precisión, estilo y el tiempo que tu corte merece.'")}
    <label class="field"><span>Texto de portada</span><textarea name="hero_texto" rows="2" maxlength="300">${esc(n.hero_texto || "")}</textarea></label>
    <label class="field"><span>Filosofía / sobre la barbería (párrafos separados por una línea en blanco)</span><textarea name="filosofia" rows="5" maxlength="2000">${esc(n.filosofia || "")}</textarea></label>
    <button class="btn" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="cfgMsg"></p></form>`;
  if (tab === "marca") body = `<form class="form card" id="cfgForm" data-key="negocio">
    ${imgField("logo_url", n.logo_url, "Logo (PNG con fondo transparente, ideal)")}
    ${imgField("hero_imagen", n.hero_imagen, "Foto de portada (horizontal, mín. 1600 px)")}
    ${imgField("about_imagen", n.about_imagen, "Foto de la sección “La barbería” (vertical)")}
    <label class="field" style="max-width:220px"><span>Color de acento</span><input type="color" name="color_acento" value="${esc(/^#[0-9a-f]{6}$/i.test(n.color_acento || "") ? n.color_acento : "#141312")}"></label>
    <button class="btn" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="cfgMsg"></p></form>`;
  if (tab === "reservas") body = `<form class="form card" id="cfgForm" data-key="reservas">
    <div class="grid-2">${num("intervalo_min", "Intervalo entre horas de inicio (min)", 5, 120, 35)}${num("anticipacion_min_minutos", "Anticipación mínima (minutos)", 0, 10080, 60)}
      ${num("anticipacion_max_dias", "Anticipación máxima (días)", 1, 365, 30)}${num("cancelacion_min_horas", "Cancelar/reprogramar hasta (horas antes)", 0, 168, 2)}
      ${num("max_reservas_activas", "Máx. citas activas por cliente", 1, 20, 3)}${num("pendiente_horas", "Horas para confirmar una pendiente", 1, 168, 12)}</div>
    <label class="check"><input type="checkbox" name="confirmacion_automatica" ${r.confirmacion_automatica === false ? "" : "checked"}> Confirmar automáticamente las reservas web (si se desactiva, quedan “pendientes” y bloquean el horario solo durante las horas indicadas)</label>
    <label class="check"><input type="checkbox" name="reprogramacion_permitida" ${r.reprogramacion_permitida === false ? "" : "checked"}> Permitir que el cliente reprograme en línea</label>
    <label class="check"><input type="checkbox" name="cualquier_barbero" ${r.cualquier_barbero === false ? "" : "checked"}> Ofrecer “Cualquier barbero disponible”</label>
    <button class="btn" type="submit" data-busy="Guardando…">Guardar reglas</button><p class="form-msg" id="cfgMsg"></p></form>`;
  if (tab === "galeria") body = `<div class="card"><form class="toolbar" id="galForm"><input type="file" name="file" accept="image/jpeg,image/png,image/webp" multiple required><input name="caption" maxlength="140" placeholder="Descripción (opcional)" class="grow"><button class="btn btn--sm" type="submit" data-busy="Subiendo…">Subir fotos</button></form>
    <p class="muted small">Sube solo fotos reales de la barbería y sus trabajos. Si no hay fotos, la sección no aparece en la web.</p>
    ${State.gallery.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Descripción</th><th>Orden</th><th>Estado</th><th></th></tr></thead><tbody>${State.gallery.map((g) => `<tr class="${g.active ? "" : "off"}"><td><img class="thumb" src="${esc(g.image_url)}" alt=""></td>
      <td><input data-cap="${g.id}" value="${esc(g.caption || "")}" maxlength="140"></td><td><input type="number" data-ord="${g.id}" value="${g.sort_order}" style="width:80px"></td><td>${g.active ? "Visible" : "Oculta"}</td>
      <td class="row" style="flex-wrap:nowrap"><button class="btn btn--sm btn--ghost" data-gtog="${g.id}">${g.active ? "Ocultar" : "Mostrar"}</button><button class="btn btn--sm btn--ghost btn--danger-text" data-gdel="${g.id}">Eliminar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Aún no hay fotos.</p>`}</div>`;

  const html = shell("configuracion", "Configuración", "", `<nav class="tabs">${tabs.map(([k, v]) => `<a href="#/admin/configuracion/${k}" class="${k === tab ? "is-on" : ""}">${v}</a>`).join("")}</nav>${body}`);
  const mount = () => {
    $("#cfgForm")?.addEventListener("submit", (e) => {
      e.preventDefault(); const form = e.target, key = form.dataset.key, f = formData(form);
      busy(e.submitter, async () => {
        try {
          let value;
          if (key === "reservas") {
            value = { ...r };
            ["intervalo_min", "anticipacion_min_minutos", "anticipacion_max_dias", "cancelacion_min_horas", "max_reservas_activas", "pendiente_horas"].forEach((k) => { value[k] = Math.max(0, parseInt(f[k], 10) || 0); });
            ["confirmacion_automatica", "reprogramacion_permitida", "cualquier_barbero"].forEach((k) => { value[k] = form[k].checked; });
            if (value.intervalo_min < 5) throw new Error("El intervalo mínimo es 5 minutos.");
          } else {
            value = { ...n };
            for (const [k, v] of Object.entries(f)) if (!(form[k]?.type === "file") && !k.endsWith("_quitar")) value[k] = String(v).trim();
            for (const k of ["logo_url", "hero_imagen", "about_imagen"]) if (form[k]) value[k] = (await imgValue(form, k, n[k], "marca")) || "";
            for (const k of ["mapa_url", "whatsapp_url", "instagram", "facebook", "tiktok"]) if (value[k] && !/^https?:\/\//i.test(value[k])) throw new Error(`El enlace “${k}” debe empezar por https://`);
          }
          const { error } = await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
          if (error) throw error;
          toast("Configuración guardada."); refresh();
        } catch (err) { setMsg($("#cfgMsg"), /^(El |Formato|La imagen)/.test(err.message) ? err.message : friendly(err)); }
      });
    });
    $("#galForm")?.addEventListener("submit", (e) => {
      e.preventDefault(); const files = [...e.target.file.files], caption = e.target.caption.value.trim() || null;
      busy(e.submitter, async () => {
        try {
          let ord = Math.max(0, ...State.gallery.map((g) => g.sort_order)) + 1;
          for (const file of files) { const url = await uploadImage(file, "galeria"); const { error } = await sb.from("gallery").insert({ image_url: url, caption, sort_order: ord++ }); if (error) throw error; }
          toast("Fotos subidas."); refresh();
        } catch (err) { toast(/^(Formato|La imagen)/.test(err.message) ? err.message : friendly(err), "err"); }
      });
    });
    const root = $(".adm__main");
    root.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset.cap) await sb.from("gallery").update({ caption: t.value.trim() || null }).eq("id", t.dataset.cap).then(({ error }) => toast(error ? friendly(error) : "Descripción guardada.", error ? "err" : "ok"));
      if (t.dataset.ord) await save(sb.from("gallery").update({ sort_order: Number(t.value) || 0 }).eq("id", t.dataset.ord), "Orden guardado.");
    });
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.gtog) { const g = State.gallery.find((x) => x.id === b.dataset.gtog); save(sb.from("gallery").update({ active: !g.active }).eq("id", g.id), "Listo."); }
      if (b.dataset.gdel && await confirmDialog("¿Eliminar esta foto de la galería?", "Eliminar", true)) {
        const g = State.gallery.find((x) => x.id === b.dataset.gdel);
        const path = g.image_url.split("/storage/v1/object/public/media/")[1];
        if (path) await sb.storage.from("media").remove([decodeURIComponent(path)]);
        save(sb.from("gallery").delete().eq("id", g.id), "Foto eliminada.");
      }
    });
  };
  return { html, mount };
}

/* =============================== CONSENTIMIENTOS (prueba ante la SIC) =============================== */
async function vConsentimientos() {
  const rows = await q(sb.from("consent_log").select("*").order("accepted_at", { ascending: false }).limit(1000));
  const cols = [["accepted_at", "Fecha y hora"], ["full_name", "Nombre"], ["email", "Correo"], ["document", "Documento"], ["version", "Versión"], ["form", "Formulario"], ["ip", "IP"], ["user_agent", "Navegador"], ["page_url", "Página"]];
  const html = shell("clientes", "Aceptaciones legales", `<button class="btn btn--sm" id="csv" type="button" ${rows.length ? "" : "disabled"}>Descargar CSV</button>`, `
    <div class="card"><p class="muted small">Cada vez que alguien crea su cuenta o reserva queda aquí cuándo y cómo aceptó los términos y la política de privacidad (fecha, versión, formulario, IP y navegador). No se puede editar ni borrar. Úsalo como prueba si la SIC lo solicita.</p>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr>${cols.slice(0, 7).map(([, t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(fmtDateTime(r.accepted_at))}</td><td>${esc(r.full_name || "")}</td><td>${esc(r.email || "")}</td><td>${r.document === "terminos" ? "Términos" : "Privacidad"}</td><td>${esc(r.version)}</td><td>${esc(r.form)}</td><td>${esc(r.ip || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Aún no hay aceptaciones registradas.</p>`}</div>`);
  const mount = () => $("#csv")?.addEventListener("click", () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map(([, t]) => cell(t)).join(","), ...rows.map((r) => cols.map(([k]) => cell(r[k])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `aceptaciones-legales-${todayYmd()}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { html, mount };
}

/* =============================== ESTADÍSTICAS =============================== */
// Finanzas en finance_entries (solo admin, RLS): las citas completadas y las ventas entran solas; lo demás se registra a mano.
// Una cita NO es dinero recibido: el valor de citas completadas se muestra aparte como estimación.
const EXP_CATS = ["Arriendo", "Servicios públicos", "Insumos y productos", "Nómina y comisiones", "Mantenimiento", "Equipos", "Publicidad", "Impuestos", "Otros"];
const INC_CATS = ["Servicios", "Venta de productos", "Otros"];
const monthStart = (d) => d.slice(0, 8) + "01";
const monthEnd = (d) => { const [y, m] = d.split("-").map(Number); return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1); };
const signed = (v) => (v < 0 ? "−" : "") + money(Math.abs(v));

async function vEstadisticas(_, query) {
  const today = todayYmd(), p = query.p || "mes";
  const prev = monthStart(addDays(monthStart(today), -1));
  const from = p === "anterior" ? prev : p === "rango" ? query.desde : monthStart(today);
  const to = p === "anterior" ? monthEnd(prev) : p === "rango" ? (query.hasta || today) : monthEnd(today);
  if (!from || !to || to < from) throw new Error("Rango de fechas inválido.");
  const [rows, st] = await Promise.all([
    q(sb.from("finance_entries").select("*").gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }).order("created_at", { ascending: false })),
    q(sb.rpc("admin_stats", { p_from: from, p_to: to })).catch(() => null)   // falla si el rango supera 1 año
  ]);
  const of = (k) => rows.filter((r) => r.kind === k);
  const total = (k) => of(k).reduce((t, r) => t + Number(r.amount), 0);
  const gastos = total("gasto"), ingresos = total("ingreso");
  const sumBy = (list, key) => Object.entries(list.reduce((o, r) => { const k = key(r); o[k] = (o[k] || 0) + Number(r.amount); return o; }, {})).sort((a, b) => b[1] - a[1]);
  const moneyBars = (pairs) => { const max = Math.max(1, ...pairs.map(([, v]) => v)); return `<div class="bars bars--money">${pairs.map(([c, v]) => `<div class="bar"><span class="bar__label" title="${esc(c)}">${esc(c)}</span><span class="bar__track"><span class="bar__fill" style="width:${(v / max) * 100}%"></span></span><span class="bar__n">${money(v)}</span></div>`).join("")}</div>`; };
  const countBars = (list) => { const max = Math.max(1, ...list.map((x) => x.n)); return `<div class="bars">${list.map((x) => `<div class="bar"><span class="bar__label" title="${esc(x.nombre)}">${esc(x.nombre)}</span><span class="bar__track"><span class="bar__fill" style="width:${(x.n / max) * 100}%"></span></span><span class="bar__n">${x.n}</span></div>`).join("")}</div>`; };
  // Ingresos en el tiempo: por día hasta 45 días, por mes si el rango es mayor.
  const span = (new Date(to) - new Date(from)) / 864e5 + 1, byMonth = span > 45;
  const buckets = [];
  for (let d = from; d <= to; d = byMonth ? addDays(monthEnd(d), 1) : addDays(d, 1)) buckets.push(byMonth ? d.slice(0, 7) : d);
  const series = buckets.map((k) => [k, of("ingreso").filter((r) => String(r.entry_date).startsWith(k)).reduce((t, r) => t + Number(r.amount), 0)]);
  const peak = Math.max(1, ...series.map(([, v]) => v));
  const label2 = (k) => byMonth ? fmtDay(`${k}-15`, { month: "short", year: "2-digit" }) : fmtDay(k, { day: "numeric", month: "short" });
  const byCat = Object.entries(of("gasto").reduce((o, r) => (o[r.category] = (o[r.category] || 0) + Number(r.amount), o), {})).sort((a, b) => b[1] - a[1]);
  const list = query.tipo ? of(query.tipo) : rows;
  const label = `${fmtDay(from, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`;

  const html = shell("estadisticas", "Estadísticas", `<button class="btn btn--sm btn--ghost" type="button" data-new="ingreso">Registrar ingreso</button><button class="btn btn--sm" type="button" data-new="gasto">Registrar gasto</button>`, `
    <form class="toolbar" id="perForm">
      <div class="seg" role="group" aria-label="Periodo">${[["mes", "Mes actual"], ["anterior", "Mes anterior"]].map(([k, v]) => `<a href="#/admin/estadisticas?p=${k}" class="${p === k ? "is-on" : ""}">${v}</a>`).join("")}</div>
      <input type="date" name="desde" value="${from}" aria-label="Desde"><input type="date" name="hasta" value="${to}" aria-label="Hasta">
      <button class="btn btn--sm btn--ghost" type="submit">Aplicar fechas</button>
      <span class="muted small">${esc(label)}</span>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Ingresos</span><strong>${money(ingresos)}</strong><small>${of("ingreso").length} registro(s)</small></div>
      <div class="kpi"><span>Gastos</span><strong>${money(gastos)}</strong><small>${of("gasto").length} registro(s)</small></div>
      <div class="kpi"><span>Balance neto</span><strong>${signed(ingresos - gastos)}</strong><small>ingresos − gastos</small></div>
      <div class="kpi"><span>Citas completadas</span><strong>${st ? st.completadas : "—"}</strong><small>${st ? `${st.total - st.canceladas - st.completadas - st.no_asistio} por atender · ${st.no_asistio} no vinieron · ${st.canceladas} canceladas` : "rango muy largo"}</small></div>
    </div>
    <div class="card chart-card"><h2>Ingresos ${byMonth ? "por mes" : "por día"}</h2>
      ${ingresos ? `<div class="vchart" role="img" aria-label="Ingresos ${byMonth ? "por mes" : "por día"}; máximo ${money(Math.max(...series.map(([, v]) => v)))}. El detalle está en la tabla de movimientos.">
        ${series.map(([k, v]) => `<div class="vchart__c" data-tip="${esc(label2(k))}: ${money(v)}"><i style="height:${(v / peak) * 100}%"></i></div>`).join("")}</div>
      <div class="vchart__x"><span>${esc(label2(buckets[0]))}</span><span>Máximo: ${money(Math.max(...series.map(([, v]) => v)))}</span><span>${esc(label2(buckets.at(-1)))}</span></div>` : `<p class="muted">Aún no hay ingresos en este periodo. Las citas completadas y las ventas aparecen aquí solas.</p>`}</div>
    <div class="cards-3">
      <div class="card"><h2>Ingresos por origen</h2>${ingresos ? moneyBars(sumBy(of("ingreso"), (r) => r.category)) : `<p class="muted">Sin ingresos en el periodo.</p>`}</div>
      <div class="card"><h2>Medios de pago</h2>${ingresos ? moneyBars(sumBy(of("ingreso"), (r) => r.method || "Sin indicar")) : `<p class="muted">Sin ingresos en el periodo.</p>`}</div>
      <div class="card"><h2>Gastos por categoría</h2>${byCat.length ? moneyBars(byCat) : `<p class="muted">Sin gastos en el periodo.</p>`}</div>
      <div class="card"><h2>Servicios más pedidos</h2>${st?.por_servicio?.length ? countBars(st.por_servicio) : `<p class="muted">Sin citas en el periodo.</p>`}</div>
      <div class="card"><h2>Citas por barbero</h2>${st?.por_barbero?.length ? countBars(st.por_barbero) : `<p class="muted">Sin citas en el periodo.</p>`}</div>
    </div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Tipo">${[["", "Todos"], ["gasto", "Gastos"], ["ingreso", "Ingresos"]].map(([k, v]) => `<a href="${hrefWith("#/admin/estadisticas", query, { tipo: k })}" class="${(query.tipo || "") === k ? "is-on" : ""}">${v}</a>`).join("")}</div></div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th class="num">Valor</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr><td>${esc(fmtDay(r.entry_date, { day: "numeric", month: "short", year: "numeric" }))}</td><td><span class="badge ${r.kind === "gasto" ? "badge--cancelada" : "badge--confirmada"}">${r.kind === "gasto" ? "Gasto" : "Ingreso"}</span></td>
        <td>${esc(r.description)}${r.notes ? `<br><span class="muted">${esc(r.notes)}</span>` : ""}</td><td>${esc(r.category)}${r.method ? `<br><span class="muted">${esc(r.method)}</span>` : ""}</td>
        <td class="num">${r.kind === "gasto" ? "−" : ""}${money(r.amount)}</td>
        <td class="nowrap"><button class="btn btn--sm btn--ghost" data-edit-fin="${r.id}">Editar</button> <button class="btn btn--sm btn--ghost btn--danger-text" data-del-fin="${r.id}">Eliminar</button></td></tr>`).join("")}
    </tbody></table></div>` : emptyState("No hay movimientos en este periodo.", "Registra los gastos del local con “Registrar gasto”.")}`);

  const mount = () => {
    $("#perForm").addEventListener("submit", (e) => { e.preventDefault(); const f = formData(e.target); if (f.desde && f.hasta) go(`#/admin/estadisticas?p=rango&desde=${f.desde}&hasta=${f.hasta}`); });
    $(".adm__main").addEventListener("click", async (e) => {
      const n = e.target.closest("[data-new]"); if (n) return financeEditor({ kind: n.dataset.new });
      const ed = e.target.closest("[data-edit-fin]"); if (ed) return financeEditor(rows.find((r) => r.id === ed.dataset.editFin));
      const d = e.target.closest("[data-del-fin]");
      if (!d) return;
      const r = rows.find((x) => x.id === d.dataset.delFin);
      if (await confirmDialog(`¿Eliminar el ${r.kind} “${r.description}” por ${money(r.amount)}?`, "Eliminar", true)) save(sb.from("finance_entries").delete().eq("id", r.id), "Movimiento eliminado.");
    });
  };
  return { html, mount };
}

function financeEditor(r = {}) {
  const kind = r.kind || "gasto", cats = kind === "gasto" ? EXP_CATS : INC_CATS;
  const m = modal(`<h2 class="modal__t">${r.id ? "Editar" : "Registrar"} ${kind}</h2>
    <form class="form" id="finForm" novalidate>
      <label class="field"><span>Descripción</span><input name="description" required maxlength="200" value="${esc(r.description || "")}" placeholder="${kind === "gasto" ? "Ej.: arriendo del local" : "Ej.: caja del día"}"></label>
      <div class="grid-2">
        <label class="field"><span>Categoría</span><input name="category" required maxlength="60" list="finCats" value="${esc(r.category || "")}"><datalist id="finCats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="field"><span>Valor (COP)</span><input name="amount" type="number" min="1" step="any" inputmode="decimal" required value="${r.amount ?? ""}"></label>
        <label class="field"><span>Fecha</span><input name="entry_date" type="date" required value="${String(r.entry_date || todayYmd()).slice(0, 10)}"></label>
        <label class="field"><span>Medio de pago (opcional)</span><input name="method" maxlength="40" list="finMethods" value="${esc(r.method || "")}"><datalist id="finMethods"><option value="Efectivo"><option value="Transferencia"><option value="Nequi"><option value="Tarjeta"></datalist></label>
      </div>
      <label class="field"><span>Notas (opcional)</span><textarea name="notes" rows="2" maxlength="1000">${esc(r.notes || "")}</textarea></label>
      <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="finMsg" role="alert"></p>
    </form>`);
  $("#finForm", m.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target), amount = Number(f.amount);
    if (!f.description.trim() || !f.category.trim()) return setMsg($("#finMsg", m.el), "Completa descripción y categoría.");
    if (!(amount > 0)) return setMsg($("#finMsg", m.el), "El valor debe ser mayor que cero.");
    if (!f.entry_date) return setMsg($("#finMsg", m.el), "Indica la fecha.");
    const row = { kind, description: f.description.trim(), category: f.category.trim(), amount, entry_date: f.entry_date, method: f.method.trim() || null, notes: f.notes.trim() || null };
    busy(e.submitter, async () => {
      const { error } = r.id ? await sb.from("finance_entries").update(row).eq("id", r.id) : await sb.from("finance_entries").insert(row);
      if (error) return setMsg($("#finMsg", m.el), friendly(error));
      m.close(); toast(r.id ? "Movimiento actualizado." : "Movimiento registrado."); refresh();
    });
  });
}

/* Ventas en el local (cliente que llega sin cita): caja visual. Se guardan como ingresos en finanzas. */
const SALE_PAY = [["Efectivo", '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'], ["Nequi", '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'],
  ["Transferencia", '<path d="M4 8h15l-4-4M20 16H5l4 4"/>'], ["Tarjeta", '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>']];
async function vVentas() {
  const today = todayYmd();
  const svcs = State.services.filter((s) => s.active && !s.deleted_at), barbers = State.barbers.filter((b) => b.active && !b.deleted_at);
  const sales = (await q(sb.from("finance_entries").select("*").eq("kind", "ingreso").eq("entry_date", today).order("created_at", { ascending: false }))).filter((r) => r.description.startsWith("Venta"));
  const dayTotal = sales.reduce((t, r) => t + Number(r.amount), 0);
  const catalog = [
    ...svcs.map((s) => ({ key: `s:${s.id}`, tab: "Servicios", n: s.name, p: s.price == null ? null : Number(s.price), img: svcPhoto(s), svc: true })),
    ...Object.entries(SHOP).flatMap(([c, l]) => l.map(([n, p, img]) => ({ key: `x:${img}`, tab: c, n, p, img: `assets/tienda/mini/${img}.jpg`, svc: false })))
  ];
  const tabs = ["Servicios", ...Object.keys(SHOP)], cart = new Map();
  const html = shell("ventas", "Ventas", "", `
    <div class="pos__today">
      <div><span>Vendido hoy</span><b>${money(dayTotal)}</b></div>
      ${SALE_PAY.map(([m]) => [m, sales.filter((r) => r.method === m).reduce((t, r) => t + Number(r.amount), 0)]).filter(([, v]) => v).map(([m, v]) => `<div><span>${m}</span><b>${money(v)}</b></div>`).join("")}
    </div>
    <div class="pos">
      <section class="pos__cat">
        <input type="search" class="shop__search" id="posQ" placeholder="Buscar servicio o producto…" aria-label="Buscar">
        <div class="chips" role="group" aria-label="Categorías">${tabs.map((t, i) => `<button type="button" class="chip ${i ? "" : "is-on"}" data-tab="${t}">${t}</button>`).join("")}</div>
        <div class="tiles">${catalog.map((c) => `<button type="button" class="tile${c.svc ? "" : " tile--pk"}" data-add="${c.key}" data-tab2="${c.tab}" data-f="${esc(c.n.toLowerCase())}" ${c.tab === "Servicios" ? "" : "hidden"}>
          <span class="tile__pic"><img src="${esc(c.img)}" alt="" loading="lazy"></span><span class="tile__n" hidden></span>
          <span class="tile__name">${esc(c.n)}</span><span class="tile__price">${c.p == null ? "Precio libre" : money(c.p)}</span></button>`).join("")}</div>
        <div class="card pos__hist"><h2>Últimas ventas de hoy</h2>${sales.length ? `<ul>${sales.slice(0, 12).map((r) => `<li><span>${esc(r.description.replace(/^Venta( adicionales)?: /, ""))}${r.notes ? `<small>${esc(r.notes)}</small>` : ""}</span><b>${money(r.amount)}</b></li>`).join("")}</ul><p class="muted small">Para editar o borrar una venta, ve a Estadísticas.</p>` : `<p class="muted">Aún no hay ventas hoy. ¡La primera se registra en segundos!</p>`}</div>
      </section>
      <aside class="ticket2" id="ticket">
        <h2>Venta actual</h2>
        <ul class="ticket2__items" id="tkItems"></ul>
        <div class="ticket2__sec"><span>Atendió</span><div class="tpills">${barbers.map((b) => `<button type="button" class="tpill" data-barber="${b.id}">${avatar(b.name, b.photo_url)}${esc(b.name)}</button>`).join("") || `<small>Sin barberos activos</small>`}</div></div>
        <div class="ticket2__sec"><span>Medio de pago</span><div class="tpay">${SALE_PAY.map(([m, ic], i) => `<button type="button" class="${i ? "" : "is-on"}" data-pay="${m}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${m}</button>`).join("")}</div></div>
        <div class="ticket2__row"><label><span>Cliente (opcional)</span><input id="tkClient" maxlength="80" placeholder="Nombre"></label><label><span>Fecha</span><input id="tkDate" type="date" value="${today}" max="${today}"></label></div>
        <button class="pos__jump" id="tkJump" type="button" hidden>Ver venta <b id="tkJumpN"></b></button>
        <button class="ticket2__pay" id="tkPay" type="button" data-busy="Guardando…" disabled>Cobrar <b id="tkTotal">${money(0)}</b></button>
        <p class="form-msg" id="tkMsg" role="alert"></p>
      </aside>
    </div>`);

  const mount = () => {
    let barber = barbers.length === 1 ? barbers[0].id : "", method = SALE_PAY[0][0], tab = "Servicios";
    const total = () => [...cart.values()].reduce((t, l) => t + (Number(l.p) || 0) * l.q, 0);
    const sumUp = () => { $("#tkTotal").textContent = money(total()); $("#tkPay").disabled = !cart.size; $("#tkJump").hidden = !cart.size; $("#tkJumpN").textContent = money(total()); };
    const paint = () => {
      $("#tkItems").innerHTML = cart.size ? [...cart.values()].map((l) => `<li><img src="${esc(l.img)}" alt=""><div><b>${esc(l.n)}</b>
          ${l.svc ? `<label class="tk__price">$ <input type="number" min="0" step="any" inputmode="decimal" data-price="${l.key}" value="${l.p ?? ""}" placeholder="Precio" aria-label="Precio de ${esc(l.n)}"></label>` : `<small>${money(l.p)} c/u</small>`}</div>
          <span class="qty"><button type="button" data-q="${l.key}" data-d="-1" aria-label="Quitar uno">−</button><b>${l.q}</b><button type="button" data-q="${l.key}" data-d="1" aria-label="Agregar uno">+</button></span></li>`).join("")
        : `<li class="ticket2__empty">Toca un servicio o producto para empezar</li>`;
      $$("[data-add]").forEach((b) => { const l = cart.get(b.dataset.add), n = $(".tile__n", b); n.hidden = !l; n.textContent = l?.q || ""; b.classList.toggle("is-in", !!l); });
      sumUp();
    };
    const filter = () => {
      const t = $("#posQ").value.trim().toLowerCase();
      $$("[data-add]").forEach((b) => { b.hidden = t ? !b.dataset.f.includes(t) : b.dataset.tab2 !== tab; });
    };
    $("#posQ").addEventListener("input", filter);
    $(".pos").addEventListener("input", (e) => { const k = e.target.dataset?.price; if (k) { cart.get(k).p = e.target.value === "" ? null : Number(e.target.value); sumUp(); } });
    $(".pos").addEventListener("click", (e) => {
      const tb = e.target.closest("[data-tab]");
      if (tb) { tab = tb.dataset.tab; $("#posQ").value = ""; $$("[data-tab]").forEach((x) => x.classList.toggle("is-on", x === tb)); return filter(); }
      const add = e.target.closest("[data-add]");
      if (add) { const c = catalog.find((x) => x.key === add.dataset.add), l = cart.get(c.key); if (l) l.q++; else cart.set(c.key, { ...c, q: 1 }); return paint(); }
      const qb = e.target.closest("[data-q]");
      if (qb) { const l = cart.get(qb.dataset.q); l.q += +qb.dataset.d; if (l.q < 1) cart.delete(l.key); return paint(); }
      const br = e.target.closest("[data-barber]");
      if (br) { barber = barber === br.dataset.barber ? "" : br.dataset.barber; return $$("[data-barber]").forEach((x) => x.classList.toggle("is-on", x.dataset.barber === barber)); }
      const pm = e.target.closest("[data-pay]");
      if (pm) { method = pm.dataset.pay; return $$("[data-pay]").forEach((x) => x.classList.toggle("is-on", x === pm)); }
    });
    $("#tkJump").addEventListener("click", () => $("#ticket").scrollIntoView({ behavior: "smooth" }));
    $("#tkPay").addEventListener("click", (e) => {
      const lines = [...cart.values()], msg = $("#tkMsg"), day = $("#tkDate").value;
      if (lines.some((l) => !(l.p > 0))) return setMsg(msg, "Escribe el precio de cada servicio.");
      if (!day) return setMsg(msg, "Indica la fecha.");
      const base = { kind: "ingreso", entry_date: day, method, notes: [barber ? barberName(barber) : "", $("#tkClient").value.trim()].filter(Boolean).join(" · ") || null };
      const prods = lines.filter((l) => !l.svc), sum = total();
      const rows = [
        ...lines.filter((l) => l.svc).map((l) => ({ ...base, description: `Venta: ${l.n}${l.q > 1 ? ` ×${l.q}` : ""}`.slice(0, 200), category: "Servicios", amount: l.p * l.q })),
        ...(prods.length ? [{ ...base, description: `Venta adicionales: ${prods.map((l) => `${l.q}× ${l.n}`).join(", ")}`.slice(0, 200), category: "Venta de productos", amount: prods.reduce((t, l) => t + l.p * l.q, 0) }] : [])
      ];
      busy(e.currentTarget, async () => {
        const { error } = await sb.from("finance_entries").insert(rows);
        if (error) return setMsg(msg, friendly(error));
        $("#ticket").innerHTML = `<div class="ticket2__done"><span class="ticket2__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span><h2>¡Venta registrada!</h2><p class="ticket2__big">${money(sum)}</p><p>${esc(method)} · sumado a finanzas</p><button class="ticket2__pay" type="button" id="tkNew">Nueva venta</button></div>`;
        $("#tkNew").addEventListener("click", refresh); $("#tkNew").focus(); $("#ticket").scrollIntoView({ block: "center" });
      });
    });
    if (barber) $(`[data-barber="${barber}"]`)?.classList.add("is-on");
    paint();
  };
  return { html, mount };
}
