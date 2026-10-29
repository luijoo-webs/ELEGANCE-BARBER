/* Panel administrativo (#/admin/...). Toda escritura la autoriza el servidor (RLS + RPC con is_admin()). */
import {
  sb, State, $, $$, esc, safeUrl, money, priceLabel, durLabel, DAYS, DAYS_SHORT, todayYmd, addDays, mondayOf, weekday, ymd, toIso, hhmm,
  fmtTime, fmtDate, fmtDay, fmtDateTime, minutes, fromMinutes, shortTime, STATUS, statusBadge, friendly, toast, loader, emptyState,
  formData, setMsg, busy, modal, confirmDialog, uploadImage, loadPublic, isAdmin
} from "./core.js";

const SECTIONS = [
  ["resumen", "Resumen"], ["agenda", "Agenda"], ["citas", "Citas"], ["servicios", "Servicios"], ["barberos", "Barberos"],
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

const ICON = {
  resumen: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  agenda: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  citas: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  servicios: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  barberos: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.6-5 7-5s6 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.3 2.2 4 5"/>',
  horarios: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  configuracion: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  actividad: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  estadisticas: '<path d="M3 21h18M6 17V10M11 17V5M16 17v-4M21 17V8"/>',
  sitio: '<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/><circle cx="12" cy="12" r="9"/>',
  cuenta: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
};
const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

function shell(sec, title, actions, body) {
  const logo = safeUrl(State.settings.negocio?.logo_url) || "assets/logo-crown-light.png";
  return `<div class="adm">
    <aside class="adm__side">
      <a class="adm__brand" href="#/admin" aria-label="Panel — inicio"><img src="${esc(logo)}" alt=""><span><b>Elegance</b><small>Panel admin</small></span></a>
      <p class="adm__label">Gestión</p>
      <nav aria-label="Secciones del panel">${SECTIONS.map(([k, v]) => `<a href="#/admin/${k}" class="${k === sec ? "is-on" : ""}" ${k === sec ? 'aria-current="page"' : ""}>${ico(k)}${v}</a>`).join("")}</nav>
      <div class="adm__bottom"><a href="#/">${ico("sitio")}Ver sitio</a><a href="#/cuenta">${ico("cuenta")}Mi cuenta</a></div>
    </aside>
    <div class="adm__main"><div class="adm__head"><h1>${title}</h1><div class="row">${actions || ""}</div></div>${body}</div></div>`;
}

export async function view(sec, sub, query) {
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!isAdmin()) return { html: emptyState("No tienes permisos de administrador.") };
  await loadPublic();   // con sesión de admin, RLS devuelve también lo inactivo
  const views = { resumen: vResumen, agenda: vAgenda, citas: vCitas, servicios: vServicios, barberos: vBarberos, clientes: vClientes,
    horarios: vHorarios, configuracion: vConfig, actividad: vActividad, estadisticas: vEstadisticas };
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
const SLOT = 15, PX = 1.2;   // 15 min por fila, 1.2 px por minuto
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
  if (statusF === "activas") qa = qa.neq("status", "cancelada"); else if (statusF !== "todas") qa = qa.eq("status", statusF);
  let qt = sb.from("time_off").select("*").lt("starts_at", re).gt("ends_at", rs);
  const [appts, offs] = await Promise.all([q(qa), q(qt)]);
  const offsF = offs.filter((t) => !barberF || !t.barber_id || t.barber_id === barberF);

  // Columnas: modo día → un barbero por columna; modo semana → un día por columna.
  const cols = mode === "dia"
    ? barbers.map((b) => ({ key: b.id, date, barberId: b.id, label: esc(b.name), sub: "" }))
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
        <strong>${fmtTime(a.starts_at)} ${esc(a.client_name)}</strong>${esc(a.service_name)}${mode === "semana" && !barberF ? ` · ${esc(a.barber_name)}` : ""}</button>`;
    }).join("");
    const blocks = offsF.filter((t) => !t.barber_id || mode === "semana" || t.barber_id === c.barberId).map((t) => {
      const ds = new Date(toIso(c.date, "00:00")).getTime(), de = ds + 864e5;
      const s = Math.max(new Date(t.starts_at).getTime(), ds), e = Math.min(new Date(t.ends_at).getTime(), de);
      if (e <= s) return "";
      const sm = Math.max(lo, (s - ds) / 6e4), em = Math.min(hi, (e - ds) / 6e4);
      if (em <= sm) return "";
      return `<button type="button" class="ev ev--block" style="top:${(sm - lo) * PX}px;height:${(em - sm) * PX}px" data-off="${t.id}" title="${esc(t.reason || t.kind)}"><strong>${esc(KIND[t.kind] || t.kind)}${t.barber_id ? "" : " · negocio"}</strong>${esc(t.reason || "")}${mode === "semana" && t.barber_id && !barberF ? ` · ${esc(barberName(t.barber_id))}` : ""}</button>`;
    }).join("");
    return `<div class="agenda__col">${slots}${evs}${blocks}</div>`;
  };

  const nav = (n) => hrefWith("#/admin/agenda", query, { fecha: addDays(date, n * days) });
  const body = !barbers.length ? emptyState("No hay barberos activos.", "Crea un barbero para usar la agenda.", `<a class="btn" href="#/admin/barberos">Ir a barberos</a>`) : `
    <div class="toolbar">
      <a class="icon-btn" href="${nav(-1)}" aria-label="Anterior" style="display:grid;place-items:center;text-decoration:none">‹</a>
      <a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/agenda", query, { fecha: today })}">Hoy</a>
      <a class="icon-btn" href="${nav(1)}" aria-label="Siguiente" style="display:grid;place-items:center;text-decoration:none">›</a>
      <strong>${mode === "dia" ? cap(fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`}</strong>
      <input type="date" id="agDate" value="${date}" aria-label="Ir a fecha">
      <div class="seg" role="group" aria-label="Vista"><a href="${hrefWith("#/admin/agenda", query, { vista: "dia" })}" class="${mode === "dia" ? "is-on" : ""}">Día</a><a href="${hrefWith("#/admin/agenda", query, { vista: "semana" })}" class="${mode === "semana" ? "is-on" : ""}">Semana</a></div>
      <select id="agBarber" aria-label="Barbero"><option value="">Todos los barberos</option>${State.barbers.filter((b) => b.active && !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === barberF ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <select id="agStatus" aria-label="Estado">${[["activas", "Activas"], ["pendiente", "Pendientes"], ["confirmada", "Confirmadas"], ["completada", "Completadas"], ["cancelada", "Canceladas"], ["todas", "Todas"]].map(([k, v]) => `<option value="${k}" ${k === statusF ? "selected" : ""}>${v}</option>`).join("")}</select>
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
function apptEditor({ appt = null, date = todayYmd(), time = "", barberId = "", clientId = null, clientName = "" } = {}) {
  const services = State.services.filter((s) => !s.deleted_at && (s.active || s.id === appt?.service_id));
  const barbers = State.barbers.filter((b) => b.active && !b.deleted_at);
  let client = appt ? { id: appt.client_id, name: appt.client_name } : clientId ? { id: clientId, name: clientName } : null;
  const d0 = appt ? ymd(new Date(appt.starts_at)) : date, t0 = appt ? hhmm(appt.starts_at) : time;
  const m = modal(`<h2 class="modal__t">${appt ? "Reprogramar / editar cita" : "Nueva cita"}</h2>
    <form class="form" id="apptForm" novalidate>
      ${appt ? `<p class="muted">Cliente: <strong>${esc(appt.client_name)}</strong></p>` : `
      <div class="field"><span>Cliente registrado</span><input id="cliSearch" placeholder="Buscar por nombre, correo o celular" autocomplete="off" value="${esc(client?.name || "")}">
        <div id="cliResults" class="pick-list"></div></div>
      <div class="grid-2" id="walkin" ${client ? "hidden" : ""}><label class="field"><span>…o nombre (sin cuenta)</span><input name="client_name" maxlength="120"></label>
        <label class="field"><span>Celular</span><input name="client_phone" type="tel" maxlength="30"></label></div>`}
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
  const [a, log] = await Promise.all([
    q(sb.from("appointments").select("*").eq("id", id).single()),
    q(sb.from("audit_log").select("*").eq("entity", "appointments").eq("entity_id", id).order("at", { ascending: false }).limit(20))
  ]).catch((e) => { toast(friendly(e), "err"); return []; });
  if (!a) return;
  const active = ["pendiente", "confirmada"].includes(a.status), started = new Date(a.starts_at) <= new Date();
  const m = modal(`<h2 class="modal__t">${esc(a.client_name || "Cliente")} ${statusBadge(a.status)}</h2>
    <dl class="kv">
      <dt>Servicio</dt><dd>${esc(a.service_name)} · ${durLabel(a.duration_min)}</dd>
      <dt>Precio</dt><dd>${priceLabel(a.price)}</dd>
      <dt>Barbero</dt><dd>${esc(a.barber_name)}</dd>
      <dt>Fecha</dt><dd>${esc(fmtDate(a.starts_at, { year: "numeric" }))}</dd>
      <dt>Hora</dt><dd>${fmtTime(a.starts_at)} – ${fmtTime(a.ends_at)}</dd>
      <dt>Contacto</dt><dd>${esc(a.client_phone || "—")}${a.client_email ? ` · ${esc(a.client_email)}` : ""}${a.client_id ? ` · <a href="#/admin/clientes/${a.client_id}" data-close>ver cliente</a>` : " · sin cuenta"}</dd>
      <dt>Origen</dt><dd>${a.source === "admin" ? "Creada por administración" : "Reserva web"} · ${esc(fmtDateTime(a.created_at))}</dd>
      ${a.client_notes ? `<dt>Nota del cliente</dt><dd>${esc(a.client_notes)}</dd>` : ""}
      ${a.status === "pendiente" && a.pending_expires_at ? `<dt>Se libera</dt><dd>${esc(fmtDateTime(a.pending_expires_at))} si no se confirma</dd>` : ""}
      ${a.cancel_reason ? `<dt>Cancelación</dt><dd>${esc(a.cancel_reason)}${a.cancelled_at ? ` · ${esc(fmtDateTime(a.cancelled_at))}` : ""}</dd>` : ""}
    </dl>
    <div class="row" style="margin:18px 0">
      ${a.status === "pendiente" ? `<button class="btn btn--sm" data-st="confirmada">Confirmar</button>` : ""}
      ${a.status === "confirmada" ? `<button class="btn btn--sm" data-st="completada" ${started ? "" : "disabled title='Disponible cuando la cita empiece'"}>Marcar completada</button><button class="btn btn--sm btn--ghost" data-st="pendiente">Volver a pendiente</button>` : ""}
      ${a.status === "completada" ? `<button class="btn btn--sm btn--ghost" data-st="confirmada">Deshacer completada</button>` : ""}
      ${active ? `<button class="btn btn--sm btn--ghost" data-edit>Reprogramar / editar</button><button class="btn btn--sm btn--ghost btn--danger-text" data-st="cancelada">Cancelar cita</button>` : ""}
      ${a.status === "cancelada" ? `<button class="btn btn--sm btn--ghost btn--danger-text" data-del>Eliminar definitivamente</button>` : ""}
    </div>
    <form class="form" id="notesForm"><label class="field"><span>Notas internas</span><textarea name="notes" rows="2" maxlength="2000">${esc(a.admin_notes || "")}</textarea></label>
      <button class="btn btn--sm btn--ghost" type="submit">Guardar nota</button></form>
    <h3 class="h-sec">Historial de cambios</h3>${auditList(log)}`, { wide: true });
  m.el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-edit]")) { m.close(); return apptEditor({ appt: a }); }
    if (e.target.closest("[data-del]")) {
      if (!(await confirmDialog(`¿Eliminar definitivamente la cita cancelada de ${a.client_name || "este cliente"} (${fmtDate(a.starts_at)} ${fmtTime(a.starts_at)})? No se puede deshacer; queda una copia en el registro de cambios.`, "Eliminar cita", true))) return;
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
      m.close(); toast(`Cita ${STATUS[b.dataset.st].toLowerCase()}.`); refresh();
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
function blockEditor({ date = todayYmd(), barberId = "", fixedBarber = false, kind = "bloqueo" } = {}) {
  const m = modal(`<h2 class="modal__t">${fixedBarber ? "Ausencia o vacaciones" : "Bloquear horario / cierre"}</h2>
    <form class="form" id="blkForm" novalidate>
      ${fixedBarber ? `<input type="hidden" name="barber" value="${barberId}">` : `<label class="field"><span>Aplica a</span><select name="barber"><option value="">Todo el negocio (nadie puede reservar)</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === barberId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>`}
      <label class="field"><span>Tipo</span><select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === kind ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="allday" checked> Días completos</label>
      <div class="grid-2"><label class="field"><span>Desde (fecha)</span><input type="date" name="d1" required value="${date}"></label><label class="field"><span>Hasta (fecha)</span><input type="date" name="d2" required value="${date}"></label></div>
      <div class="grid-2" id="hrs" hidden><label class="field"><span>Hora inicio</span><input type="time" name="t1" value="12:00" step="300"></label><label class="field"><span>Hora fin</span><input type="time" name="t2" value="13:00" step="300"></label></div>
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
  const page = Math.max(0, Number(query.pag || 0)), size = 50;
  let qa = sb.from("appointments").select("*", { count: "exact" });
  if (query.estado) qa = qa.eq("status", query.estado);
  if (query.barbero) qa = qa.eq("barber_id", query.barbero);
  if (query.desde) qa = qa.gte("starts_at", toIso(query.desde, "00:00"));
  if (query.hasta) qa = qa.lt("starts_at", toIso(addDays(query.hasta, 1), "00:00"));
  if (query.q && like(query.q)) { const t = like(query.q); qa = qa.or(`client_name.ilike.%${t}%,client_phone.ilike.%${t}%,client_email.ilike.%${t}%,service_name.ilike.%${t}%`); }
  qa = qa.order("starts_at", { ascending: query.orden === "asc" }).range(page * size, page * size + size - 1);
  const { data, count, error } = await qa;
  if (error) throw error;
  const html = shell("citas", "Citas", `<button class="btn btn--sm" id="newAppt" type="button">Nueva cita</button>`, `
    <form class="toolbar" id="fForm">
      <input class="grow" type="search" name="q" value="${esc(query.q || "")}" placeholder="Buscar cliente, celular, correo o servicio">
      <select name="estado" aria-label="Estado"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === query.estado ? "selected" : ""}>${v}</option>`).join("")}</select>
      <select name="barbero" aria-label="Barbero"><option value="">Todos los barberos</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === query.barbero ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <input type="date" name="desde" value="${esc(query.desde || "")}" aria-label="Desde"><input type="date" name="hasta" value="${esc(query.hasta || "")}" aria-label="Hasta">
      <select name="orden" aria-label="Orden"><option value="desc">Más recientes</option><option value="asc" ${query.orden === "asc" ? "selected" : ""}>Más antiguas</option></select>
      <button class="btn btn--sm" type="submit">Filtrar</button><a class="btn btn--sm btn--ghost" href="#/admin/citas">Limpiar</a>
    </form>
    ${data.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Servicio</th><th>Barbero</th><th>Estado</th><th>Origen</th></tr></thead><tbody>
      ${data.map((a) => `<tr class="click" data-appt="${a.id}" tabindex="0"><td>${esc(fmtDate(a.starts_at, { weekday: "short", year: "numeric" }))}<br><span class="muted">${fmtTime(a.starts_at)} – ${fmtTime(a.ends_at)}</span></td>
        <td>${esc(a.client_name)}<br><span class="muted">${esc(a.client_phone || a.client_email || "")}</span></td><td>${esc(a.service_name)}<br><span class="muted">${durLabel(a.duration_min)} · ${priceLabel(a.price)}</span></td>
        <td>${esc(a.barber_name)}</td><td>${statusBadge(a.status)}</td><td class="muted">${a.source === "admin" ? "Admin" : "Web"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="pager"><span>${page * size + 1}–${page * size + data.length} de ${count}</span><span class="row">
      ${page > 0 ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/citas", query, { pag: page - 1 })}">Anterior</a>` : ""}
      ${(page + 1) * size < count ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/citas", query, { pag: page + 1 })}">Siguiente</a>` : ""}</span></div>`
    : emptyState("No hay citas con esos filtros.")}`);
  const mount = () => {
    $("#newAppt").addEventListener("click", () => apptEditor({}));
    $("#fForm").addEventListener("submit", (e) => { e.preventDefault(); go(hrefWith("#/admin/citas", {}, formData(e.target))); });
    const open = (e) => { const r = e.target.closest("[data-appt]"); if (r && (e.type === "click" || e.key === "Enter")) apptDetail(r.dataset.appt); };
    $(".table-wrap")?.addEventListener("click", open); $(".table-wrap")?.addEventListener("keydown", open);
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
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Servicio</th><th>Categoría</th><th>Duración</th><th>Precio</th><th>Orden</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr class="${s.active ? "" : "off"}"><td>${safeUrl(s.image_url) ? `<img class="thumb" src="${esc(s.image_url)}" alt="">` : `<span class="thumb" style="display:block"></span>`}</td>
        <td><strong>${esc(s.name)}</strong>${s.description ? `<br><span class="muted">${esc(s.description.slice(0, 90))}</span>` : ""}</td><td>${esc(catName(s.category_id))}</td>
        <td>${durLabel(s.duration_min)}</td><td>${s.price == null ? `<span class="is-pending">Por definir</span>` : money(s.price)}</td><td>${s.sort_order}</td>
        <td>${s.active ? "Publicado" : "Oculto"}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn btn--sm btn--ghost" data-edit="${s.id}">Editar</button><button class="btn btn--sm btn--ghost" data-toggle="${s.id}">${s.active ? "Ocultar" : "Publicar"}</button><button class="btn btn--sm btn--ghost btn--danger-text" data-del="${s.id}">Eliminar</button></td></tr>`).join("")}
    </tbody></table></div>` : emptyState(query.f ? "Todos los servicios tienen precio." : "Aún no hay servicios.", query.f ? "" : "Crea el primero con “Nuevo servicio”.")}
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
        <label class="field"><span>Duración (minutos)</span><input type="number" name="duration_min" required min="5" max="480" step="5" value="${s?.duration_min ?? 30}"></label>
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
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h2>Cierres, festivos y días no laborables</h2><button class="btn btn--sm" id="addClose" type="button">Agregar cierre</button></div>
      <div id="offs">${offsTable(offs)}</div></div>
    <div class="card" style="margin-top:14px"><h2>Reglas de reserva vigentes</h2>
      <dl class="kv"><dt>Intervalo entre horas de inicio</dt><dd>${r.intervalo_min ?? 30} min</dd><dt>Anticipación mínima</dt><dd>${r.anticipacion_min_minutos ?? 60} min</dd>
      <dt>Anticipación máxima</dt><dd>${r.anticipacion_max_dias ?? 30} días</dd><dt>Cancelar/reprogramar hasta</dt><dd>${r.cancelacion_min_horas ?? 2} h antes</dd></dl>
      <p style="margin-top:12px"><a class="link-arrow" href="#/admin/configuracion/reservas">Cambiar reglas</a></p></div>`);
  const mount = () => {
    scheduleEditor($("#sched"), null);
    $("#addClose").addEventListener("click", () => blockEditor({ kind: "cierre" }));
    bindOffs($("#offs"), offs);
  };
  return { html, mount };
}

/* =============================== CLIENTES =============================== */
async function vClientes(id, query) {
  if (id) return vCliente(id);
  const page = Math.max(0, Number(query.pag || 0)), size = 50;
  let qp = sb.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * size, page * size + size - 1);
  if (query.rol) qp = qp.eq("role", query.rol);
  if (query.q && like(query.q)) { const t = like(query.q); qp = qp.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`); }
  const { data, count, error } = await qp;
  if (error) throw error;
  const counts = {};
  if (data.length) (await q(sb.from("appointments").select("client_id,status").in("client_id", data.map((p) => p.id)))).forEach((a) => {
    const c = (counts[a.client_id] ||= { total: 0, done: 0 }); c.total++; if (a.status === "completada") c.done++;
  });
  const ROLES = { client: "Cliente", admin: "Administrador", barber: "Barbero" };
  const html = shell("clientes", "Clientes", "", `
    <form class="toolbar" id="fForm"><input class="grow" type="search" name="q" value="${esc(query.q || "")}" placeholder="Buscar por nombre, correo o celular">
      <select name="rol" aria-label="Rol"><option value="">Todos los roles</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === query.rol ? "selected" : ""}>${v}</option>`).join("")}</select>
      <button class="btn btn--sm" type="submit">Buscar</button></form>
    ${data.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Celular</th><th>Registro</th><th>Citas</th><th>Rol</th></tr></thead><tbody>
      ${data.map((p) => `<tr class="click" data-cli="${p.id}" tabindex="0"><td><strong>${esc(p.full_name || "(sin nombre)")}</strong></td><td>${esc(p.email || "")}</td><td>${esc(p.phone || "—")}</td>
        <td>${esc(new Date(p.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }))}</td><td>${counts[p.id]?.total || 0} <span class="muted">(${counts[p.id]?.done || 0} completadas)</span></td><td>${ROLES[p.role]}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="pager"><span>${page * size + 1}–${page * size + data.length} de ${count}</span><span class="row">
      ${page > 0 ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/clientes", query, { pag: page - 1 })}">Anterior</a>` : ""}
      ${(page + 1) * size < count ? `<a class="btn btn--sm btn--ghost" href="${hrefWith("#/admin/clientes", query, { pag: page + 1 })}">Siguiente</a>` : ""}</span></div>`
    : emptyState("No hay clientes con esa búsqueda.")}`);
  const mount = () => {
    $("#fForm").addEventListener("submit", (e) => { e.preventDefault(); go(hrefWith("#/admin/clientes", {}, formData(e.target))); });
    const open = (e) => { const r = e.target.closest("[data-cli]"); if (r && (e.type === "click" || e.key === "Enter")) location.hash = `#/admin/clientes/${r.dataset.cli}`; };
    $(".table-wrap")?.addEventListener("click", open); $(".table-wrap")?.addEventListener("keydown", open);
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
  const html = shell("clientes", esc(p.full_name || p.email), `<button class="btn btn--sm" id="newAppt" type="button">Nueva cita para este cliente</button>`, `
    <div class="cards-2">
      <div class="card"><h2>Datos</h2><dl class="kv"><dt>Nombre</dt><dd>${esc(p.full_name || "—")}</dd><dt>Correo</dt><dd>${esc(p.email || "—")}</dd><dt>Celular</dt><dd>${esc(p.phone || "—")}</dd>
        <dt>Registro</dt><dd>${esc(fmtDateTime(p.created_at))}</dd><dt>Citas</dt><dd>${appts.length} (${appts.filter((a) => a.status === "completada").length} completadas, ${appts.filter((a) => a.status === "cancelada").length} canceladas)</dd></dl>
        <p class="muted small" style="margin-top:12px">Las contraseñas y datos de autenticación no se muestran: los gestiona Supabase Auth.</p></div>
      <div class="card"><h2>Notas internas</h2><form class="form" id="noteForm"><textarea name="notes" rows="4" maxlength="2000" placeholder="Preferencias, observaciones… (solo administración)">${esc(notes?.notes || "")}</textarea>
        <button class="btn btn--sm" type="submit">Guardar nota</button></form></div>
    </div>
    <div class="card" style="margin-bottom:14px"><h2>Rol y acceso</h2>
      ${self ? `<p class="muted">Este es tu usuario. Para evitar perder el acceso, otro administrador debe cambiar tu rol.</p>` : `
      <form class="toolbar" id="roleForm"><select name="role" aria-label="Rol"><option value="client" ${p.role === "client" ? "selected" : ""}>Cliente</option><option value="barber" ${p.role === "barber" ? "selected" : ""}>Barbero (ve su agenda en Mi cuenta)</option><option value="admin" ${p.role === "admin" ? "selected" : ""}>Administrador (acceso total)</option></select>
        <select name="barber_id" aria-label="Perfil de barbero"><option value="">— Perfil de barbero —</option>${State.barbers.filter((b) => !b.deleted_at).map((b) => `<option value="${b.id}" ${b.id === p.barber_id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
        <button class="btn btn--sm btn--ghost" type="submit">Guardar rol</button></form>`}</div>
    <div class="card"><h2>Historial de citas</h2>${appts.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Barbero</th><th>Estado</th></tr></thead><tbody>
      ${appts.map((a) => `<tr class="click" data-appt="${a.id}"><td>${esc(fmtDate(a.starts_at, { year: "numeric", weekday: "short" }))} · ${fmtTime(a.starts_at)}</td><td>${esc(a.service_name)}</td><td>${esc(a.barber_name)}</td><td>${statusBadge(a.status)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Sin citas.</p>`}</div>`);
  const mount = () => {
    $("#newAppt").addEventListener("click", () => apptEditor({ clientId: p.id, clientName: p.full_name || p.email }));
    $(".adm__main").addEventListener("click", (e) => { const r = e.target.closest("[data-appt]"); if (r) apptDetail(r.dataset.appt); });
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
    <div class="grid-2">${num("intervalo_min", "Intervalo entre horas de inicio (min)", 5, 120, 30)}${num("anticipacion_min_minutos", "Anticipación mínima (minutos)", 0, 10080, 60)}
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

/* =============================== ACTIVIDAD =============================== */
const ENTITY = { appointments: "Cita", services: "Servicio", service_categories: "Categoría", barbers: "Barbero", schedules: "Horario", time_off: "Bloqueo",
  settings: "Configuración", client_admin_notes: "Nota de cliente", gallery: "Galería", profiles: "Perfil", finance_entries: "Movimiento" };
const ACTION = { insert: "creó", update: "modificó", delete: "eliminó" };
const FIELD = { status: "estado", starts_at: "inicio", ends_at: "fin", barber_id: "barbero", barber_name: "barbero", admin_notes: "notas", price: "precio", duration_min: "duración",
  active: "activo", deleted_at: "eliminado", name: "nombre", role: "rol", value: "valores", cancel_reason: "motivo", service_name: "servicio" };
const showVal = (k, v) => v == null ? "—" : /_at$/.test(k) && typeof v === "string" ? fmtDateTime(v) : typeof v === "object" ? "…" : String(v).slice(0, 60);
function auditList(log) {
  if (!log?.length) return `<p class="muted small">Sin cambios registrados.</p>`;
  return `<ul class="log" style="list-style:none;padding:0;margin:0">${log.map((l) => {
    const changes = l.action === "update" ? Object.entries(l.details || {}).filter(([k]) => !["barber_name", "pending_expires_at", "cancelled_by", "cancelled_at"].includes(k))
      .map(([k, [a, b]]) => `${FIELD[k] || k}: ${esc(showVal(k, a))} → ${esc(showVal(k, b))}`).join("; ") : "";
    return `<li><span class="muted">${esc(fmtDateTime(l.at))}</span> · <strong>${esc(l.actor_email || (l.actor ? "usuario" : "sistema"))}</strong> ${ACTION[l.action] || l.action} ${esc((ENTITY[l.entity] || l.entity).toLowerCase())}${l.entity === "settings" ? ` (${esc(l.entity_id)})` : ""}${changes ? ` — ${changes}` : ""}</li>`;
  }).join("")}</ul>`;
}
async function vActividad(_, query) {
  let ql = sb.from("audit_log").select("*").order("at", { ascending: false }).limit(200);
  if (query.e) ql = ql.eq("entity", query.e);
  const log = await q(ql);
  const html = shell("actividad", "Actividad", "", `
    <form class="toolbar" id="fForm"><select name="e" aria-label="Tipo"><option value="">Todo</option>${Object.entries(ENTITY).map(([k, v]) => `<option value="${k}" ${k === query.e ? "selected" : ""}>${v}</option>`).join("")}</select><button class="btn btn--sm" type="submit">Filtrar</button></form>
    <div class="card"><p class="muted small">Últimos 200 cambios. Registro automático en la base de datos (no editable).</p>${auditList(log)}</div>`);
  return { html, mount: () => $("#fForm").addEventListener("submit", (e) => { e.preventDefault(); go(hrefWith("#/admin/actividad", {}, formData(e.target))); }) };
}

/* =============================== ESTADÍSTICAS =============================== */
// Finanzas: gastos e ingresos se registran a mano en finance_entries (solo admin, RLS).
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
  const gastos = total("gasto"), ingresos = total("ingreso"), hasInc = of("ingreso").length > 0;
  const byCat = Object.entries(of("gasto").reduce((o, r) => (o[r.category] = (o[r.category] || 0) + Number(r.amount), o), {})).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));
  const list = query.tipo ? of(query.tipo) : rows;
  const label = `${fmtDay(from, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`;

  const html = shell("estadisticas", "Estadísticas", `<a class="btn btn--sm btn--ghost" href="#/admin/actividad">Registro de cambios</a>
      <button class="btn btn--sm btn--ghost" type="button" data-new="ingreso">Registrar ingreso</button><button class="btn btn--sm" type="button" data-new="gasto">Registrar gasto</button>`, `
    <form class="toolbar" id="perForm">
      <div class="seg" role="group" aria-label="Periodo">${[["mes", "Mes actual"], ["anterior", "Mes anterior"]].map(([k, v]) => `<a href="#/admin/estadisticas?p=${k}" class="${p === k ? "is-on" : ""}">${v}</a>`).join("")}</div>
      <input type="date" name="desde" value="${from}" aria-label="Desde"><input type="date" name="hasta" value="${to}" aria-label="Hasta">
      <button class="btn btn--sm btn--ghost" type="submit">Aplicar fechas</button>
      <span class="muted small">${esc(label)}</span>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Ingresos registrados</span><strong>${hasInc ? money(ingresos) : "—"}</strong><small>${hasInc ? `${of("ingreso").length} registro(s)` : "Sin ingresos registrados"}</small></div>
      <div class="kpi"><span>Gastos</span><strong>${money(gastos) || "$ 0"}</strong><small>${of("gasto").length} registro(s)</small></div>
      <div class="kpi"><span>Balance neto</span><strong>${hasInc ? signed(ingresos - gastos) : "—"}</strong><small>${hasInc ? "ingresos − gastos" : "Falta registrar ingresos"}</small></div>
      <div class="kpi"><span>Citas completadas</span><strong>${st ? st.completadas : "—"}</strong><small>${st?.valor_completadas != null ? `valor estimado ${money(st.valor_completadas)}` : "sin valor estimado"}</small></div>
    </div>
    ${hasInc ? "" : `<div class="notice">Para calcular el balance faltan los <b>ingresos reales</b>. Una cita reservada o completada no es dinero recibido (la web no cobra en línea). Registra con <b>Registrar ingreso</b> lo que realmente entró a caja; puede ser el total del día.${st?.valor_completadas != null ? ` Solo como referencia: las citas completadas del periodo suman ${money(st.valor_completadas)} según el precio guardado al reservar${st.completadas_sin_precio ? ` (${st.completadas_sin_precio} sin precio no suman)` : ""}.` : ""}</div>`}
    <div class="cards-2">
      <div class="card"><h2>Gastos por categoría</h2>${byCat.length ? `<div class="bars bars--money">${byCat.map(([c, v]) => `<div class="bar"><span class="bar__label" title="${esc(c)}">${esc(c)}</span><span class="bar__track"><span class="bar__fill" style="width:${(v / maxCat) * 100}%"></span></span><span class="bar__n">${money(v)}</span></div>`).join("")}</div>` : `<p class="muted">Sin gastos en el periodo.</p>`}</div>
      <div class="card"><h2>Resumen del periodo</h2><dl class="kv">
        <dt>Ingresos</dt><dd>${hasInc ? money(ingresos) : "Sin registrar"}</dd>
        <dt>Gastos</dt><dd>${money(gastos) || "$ 0"}</dd>
        <dt>Balance neto</dt><dd><b>${hasInc ? signed(ingresos - gastos) : "—"}</b></dd>
        ${st ? `<dt>Citas atendidas o por atender</dt><dd>${st.total - st.canceladas}</dd><dt>Canceladas</dt><dd>${st.canceladas}</dd>` : ""}
      </dl></div>
    </div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Tipo">${[["", "Todos"], ["gasto", "Gastos"], ["ingreso", "Ingresos"]].map(([k, v]) => `<a href="${hrefWith("#/admin/estadisticas", query, { tipo: k })}" class="${(query.tipo || "") === k ? "is-on" : ""}">${v}</a>`).join("")}</div></div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th class="num">Valor</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr><td>${esc(fmtDay(r.entry_date, { day: "numeric", month: "short", year: "numeric" }))}</td><td><span class="badge ${r.kind === "gasto" ? "badge--cancelada" : "badge--confirmada"}">${r.kind === "gasto" ? "Gasto" : "Ingreso"}</span></td>
        <td>${esc(r.description)}${r.notes ? `<br><span class="muted">${esc(r.notes)}</span>` : ""}</td><td>${esc(r.category)}${r.method ? `<br><span class="muted">${esc(r.method)}</span>` : ""}</td>
        <td class="num">${r.kind === "gasto" ? "−" : ""}${money(r.amount)}</td>
        <td class="nowrap"><button class="btn btn--sm btn--ghost" data-edit-fin="${r.id}">Editar</button> <button class="btn btn--sm btn--ghost btn--danger-text" data-del-fin="${r.id}">Eliminar</button></td></tr>`).join("")}
    </tbody></table></div>` : emptyState("No hay movimientos en este periodo.", "Registra los gastos del local (arriendo, insumos, servicios…) y los ingresos recibidos.")}`);

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
