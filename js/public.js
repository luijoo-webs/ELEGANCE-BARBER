/* Web pública: inicio, flujo de reserva y selector semanal de horarios. */
import {
  sb, State, $, $$, esc, safeUrl, priceLabel, durLabel, DAYS, DAYS_SHORT, todayYmd, addDays, mondayOf, weekday,
  fmtDay, fmtTime, fmtDate, hhmm, ymd, friendly, toast, loader, emptyState, busy, scheduleByDay, barberWorkDays, waLink, setMsg
} from "./core.js";

const N = () => State.settings.negocio || {};
const R = () => State.settings.reservas || {};
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const activeServices = () => State.services.filter((s) => s.active);
const activeBarbers = () => State.barbers.filter((b) => b.active);
const mapUrl = () => safeUrl(N().mapa_url) ||
  (N().direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([N().direccion, N().ciudad].filter(Boolean).join(", "))}` : "");

/* =========================== INICIO ===========================
   Composición editorial: portada con imagen real (o la corona del logo),
   franja de datos útiles, la barbería, servicios y precios, barberos,
   trabajos, horario y contacto. Solo datos reales configurados en el panel. */
const igName = (u) => (String(u || "").match(/instagram\.com\/([^/?#]+)/i) || [])[1] || "";
// Fotos de ambiente (Unsplash, licencia libre): no son del local. Se reemplazan
// con las reales desde el panel (portada y foto de "la barbería").
const STOCK = { hero: "assets/fotos/silla.jpg", corte: "assets/fotos/corte.jpg", tijeras: "assets/fotos/tijeras.jpg", cliente: "assets/fotos/cliente.jpg", afeitado: "assets/fotos/afeitado.jpg" };
const label = (n, t) => `<p class="label"><span>${n}</span>${t}</p>`;

export function viewHome() {
  const n = N(), r = R();
  const services = activeServices();
  const barbers = activeBarbers();
  const gallery = State.gallery.filter((g) => g.active);
  const hours = scheduleByDay(null);
  const hasHours = hours.some((d) => d.length);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const cats = State.categories.filter((c) => c.active && services.some((s) => s.category_id === c.id));
  const uncategorized = services.filter((s) => !cats.some((c) => c.id === s.category_id));
  const heroImg = safeUrl(n.hero_imagen);
  const ig = safeUrl(n.instagram), igH = igName(n.instagram);
  const wa = waLink();
  const today = weekday(todayYmd());
  const minAnt = Number(r.anticipacion_min_minutos);
  const rules = [
    r.cancelacion_min_horas != null && `Cancela${r.reprogramacion_permitida === false ? "" : " o reprograma"} hasta ${r.cancelacion_min_horas} h antes.`,
    r.anticipacion_min_minutos != null && `Reserva con ${minAnt >= 60 && minAnt % 60 === 0 ? `${minAnt / 60} h` : `${minAnt} min`} de anticipación${r.anticipacion_max_dias ? `, hasta ${r.anticipacion_max_dias} días antes` : ""}.`,
    r.confirmacion_automatica === false ? "La barbería confirma tu cita." : "Confirmación inmediata."
  ].filter(Boolean);
  let i = 0; const num = () => String(++i).padStart(2, "0");
  const aboutImg = safeUrl(n.about_imagen);
  const ticker = [n.nombre_largo || "The Elegance Of The Barber's", n.eslogan || "Tu mejor opción", ...services.slice(0, 4).map((s) => s.name), "Reserva en línea"];
  const rv = (k) => `class="rv" style="--i:${k}"`;

  return `
  <section class="hero" id="inicio">
    <div class="hero__media"><img src="${esc(heroImg || STOCK.hero)}" alt="" fetchpriority="high"></div>
    <div class="hero__content wrap">
      <img class="hero__mark" src="assets/logo-mark.jpg" alt="" width="64" height="64">
      <p class="hero__kicker">Barbería${n.ciudad ? ` · ${esc(n.ciudad)}` : ""}</p>
      <h1 class="hero__title"><span class="ln"><span>The</span></span><span class="ln"><span>Elegance</span></span><span class="ln ln--sub"><span>of the Barber's</span></span></h1>
      <p class="hero__text">${esc(n.hero_texto || n.hero_titulo || n.eslogan || "Tu mejor opción.")}</p>
      <div class="hero__cta"><a class="btn btn--light btn--lg" href="#/reservar">Reservar cita</a><a class="link-line link-line--light" href="#/inicio/servicios">Ver servicios</a></div>
    </div>
    <span class="hero__scroll" aria-hidden="true">Desliza</span>
  </section>
  <div class="ticker" aria-hidden="true"><div class="ticker__track">${[0, 1].map(() => ticker.map((t) => `<span>${esc(t)}</span>`).join("")).join("")}</div></div>
  <div class="facts"><div class="wrap facts__in">
    <div><span>Dirección</span><p>${esc(n.direccion || "Por confirmar")}</p></div>
    <div><span>Hoy</span><p>${hasHours ? (hours[today].length ? esc(hours[today].join(" · ")) : "Cerrado") : "Horario por confirmar"}</p></div>
    <div><span>Reservas</span><p>En línea, eliges barbero y hora</p></div>
  </div></div>

  <section class="section intro" id="nosotros" aria-labelledby="t-about">
    <div class="wrap intro__grid intro__grid--photos">
      <div class="rv">
        ${label(num(), "La barbería")}
        <h2 id="t-about" class="intro__lead">${esc(n.eslogan || "Tu mejor opción.")}</h2>
      </div>
      <div class="intro__body rv" style="--i:1">
        ${n.filosofia ? n.filosofia.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("") : `<p>${esc(n.nombre_largo || "The Elegance Of The Barber's")}. ${n.direccion ? `Te esperamos en ${esc(n.direccion)}.` : ""}</p>`}
        <a class="link-line" href="#/reservar">Agenda tu visita</a>
      </div>
      <div class="intro__photos">
        <figure class="rv-img"><img src="${esc(aboutImg || STOCK.corte)}" alt="${aboutImg ? "La barbería" : ""}" loading="lazy"></figure>
        <figure class="rv-img"><img src="${esc(STOCK.tijeras)}" alt="" loading="lazy"></figure>
      </div>
    </div>
  </section>

  <section class="section section--paper" id="servicios" aria-labelledby="t-serv">
    <div class="wrap">
      <header class="sec-head rv">${label(num(), "Servicios")}<h2 id="t-serv">Servicios y precios</h2></header>
      ${services.length ? [...cats.map((c) => [c.name, services.filter((s) => s.category_id === c.id)]),
        ...(uncategorized.length ? [[cats.length ? "Otros" : "", uncategorized]] : [])]
        .map(([name, list]) => `${name ? `<h3 class="cat-title">${esc(name)}</h3>` : ""}<ul class="menu">${list.map((s, k) => menuItem(s, k)).join("")}</ul>`).join("")
        : `<p class="muted">Estamos actualizando servicios y precios.${wa ? ` <a href="${esc(wa)}" target="_blank" rel="noopener">Pregunta por WhatsApp</a>.` : ""}</p>`}
    </div>
  </section>

  <section class="section" id="barberos" aria-labelledby="t-barb">
    <div class="wrap">
      <header class="sec-head sec-head--split rv"><div>${label(num(), "El equipo")}<h2 id="t-barb">Barberos</h2></div>
        ${barbers.length ? `<a class="link-line" href="#/reservar">Reservar con tu barbero</a>` : ""}</header>
      ${barbers.length ? `<div class="team">${barbers.map((b, k) => {
        const days = barberWorkDays(b.id);
        return `<a class="person rv" style="--i:${k}" href="#/reservar?barbero=${b.id}">
          <figure class="person__photo">${safeUrl(b.photo_url) ? `<img src="${esc(b.photo_url)}" alt="${esc(b.name)}" loading="lazy">` : `<span aria-hidden="true">${esc(initials(b.name))}</span>`}</figure>
          <h3>${esc(b.name)}</h3>
          <p>${b.specialties?.length ? esc(b.specialties.join(" · ")) : days.length ? esc(days.join(" · ")) : "Horario por confirmar"}</p></a>`;
      }).join("")}</div>` : `<p class="muted">Pronto presentaremos a nuestro equipo.</p>`}
    </div>
  </section>

  ${gallery.length || ig ? `
  <section class="section section--dark" id="galeria" aria-labelledby="t-gal">
    <div class="wrap">
      <header class="sec-head sec-head--split rv"><div>${label(num(), "Trabajos")}<h2 id="t-gal">Cortes recientes</h2></div>
        ${ig ? `<a class="link-line link-line--light" href="${esc(n.instagram)}" target="_blank" rel="noopener">${igH ? `@${esc(igH)}` : "Instagram"}</a>` : ""}</header>
      ${gallery.length ? `<div class="gallery">${gallery.map((g, k) => `<figure ${rv(k % 4)}><img src="${esc(g.image_url)}" alt="${esc(g.caption || "Trabajo de Elegance Barber")}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`
        : `<p class="gallery__empty">Publicamos nuestros cortes en Instagram. <a href="${esc(n.instagram)}" target="_blank" rel="noopener">Ver perfil${igH ? ` @${esc(igH)}` : ""}</a></p>`}
    </div>
  </section>` : ""}

  <div class="band" aria-hidden="true">
    <div class="band__bg" data-parallax><img src="${esc(STOCK.cliente)}" alt="" loading="lazy"></div>
    <p class="rv">${esc(n.eslogan || "Tu mejor opción.")}<small>${esc(n.nombre_largo || "The Elegance Of The Barber's")}</small></p>
  </div>

  <section class="section" id="horario" aria-labelledby="t-hours">
    <div class="wrap visit">
      <div class="rv">
        ${label(num(), "Horario")}
        <h2 id="t-hours">Horario de atención</h2>
        ${hasHours ? `<dl class="hours">${order.map((d) => `<div class="${d === today ? "is-today" : ""}"><dt>${DAYS[d]}${d === today ? " <small>hoy</small>" : ""}</dt><dd>${hours[d].length ? esc(hours[d].join(" · ")) : "Cerrado"}</dd></div>`).join("")}</dl>`
          : `<p class="muted">Horario por confirmar.</p>`}
      </div>
      <div id="visitanos" class="rv" style="--i:1">
        ${label(num(), "Contacto")}
        <h2>Visítanos</h2>
        <ul class="contact">
          <li><span>Dirección</span><p>${n.direccion ? `${esc(n.direccion)}${n.ciudad ? `, ${esc(n.ciudad)}` : ""}` : "Por confirmar"}</p>${mapUrl() ? `<a href="${esc(mapUrl())}" target="_blank" rel="noopener">Cómo llegar</a>` : ""}</li>
          ${wa ? `<li><span>WhatsApp</span><p>Escríbenos para cualquier duda</p><a href="${esc(wa)}" target="_blank" rel="noopener">Abrir chat</a></li>` : ""}
          ${n.telefono ? `<li><span>Teléfono</span><p>${esc(n.telefono)}</p><a href="tel:${esc(String(n.telefono).replace(/[^\d+]/g, ""))}">Llamar</a></li>` : ""}
          ${ig ? `<li><span>Instagram</span><p>${igH ? `@${esc(igH)}` : "Síguenos"}</p><a href="${esc(n.instagram)}" target="_blank" rel="noopener">Seguir</a></li>` : ""}
          ${n.correo ? `<li><span>Correo</span><p>${esc(n.correo)}</p><a href="mailto:${esc(n.correo)}">Escribir</a></li>` : ""}
        </ul>
      </div>
    </div>
  </section>

  <section class="cta" aria-labelledby="t-book">
    <div class="cta__bg" aria-hidden="true"><img src="${esc(STOCK.afeitado)}" alt="" loading="lazy"></div>
    <div class="wrap cta__in rv">
      <h2 id="t-book">Reserva tu próxima cita</h2>
      <ul>${rules.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <a class="btn btn--light btn--lg" href="#/reservar">Reservar ahora</a>
    </div>
  </section>`;
}

function menuItem(s, k = 0) {
  return `<li class="rv" style="--i:${k % 6}"><a class="menu__item" href="#/reservar?servicio=${s.id}">
    <span class="menu__name">${esc(s.name)}${s.description ? `<small>${esc(s.description)}</small>` : ""}</span>
    <span class="menu__dur">${durLabel(s.duration_min)}</span>
    <span class="menu__price${s.price == null ? " is-pending" : ""}">${priceLabel(s.price)}</span></a></li>`;
}

/* ===================== SELECTOR SEMANAL DE HORARIOS =====================
   Muestra los 7 días de la semana, permite ir a semanas anteriores/posteriores
   y volver a la actual. Los horarios salen de get_availability (servidor). */
export function mountSlotPicker(el, { serviceId, barberId = null, date = null, selected = null, onPick }) {
  const today = todayYmd();
  const st = { week: mondayOf(date || today), day: date || null, slots: [], loading: true, error: null, seq: 0 };

  async function load() {
    const seq = ++st.seq;
    st.loading = true; st.error = null; render();
    const { data, error } = await sb.rpc("get_availability", { p_service: serviceId, p_barber: barberId, p_from: st.week, p_days: 7 });
    if (seq !== st.seq) return;
    st.loading = false;
    if (error) { st.error = friendly(error); st.slots = []; }
    else st.slots = data;
    const days = byDay();
    if (!st.day || st.day < st.week || st.day > addDays(st.week, 6) || !days[st.day]?.length) {
      st.day = Object.keys(days).sort().find((d) => days[d].length) || (today >= st.week && today <= addDays(st.week, 6) ? today : st.week);
    }
    render();
  }
  // Para "cualquier barbero" se muestra cada hora una sola vez (el servidor asigna barbero).
  function byDay() {
    const out = {};
    for (const s of st.slots) {
      const d = ymd(new Date(s.slot_start));
      (out[d] ||= []);
      if (!out[d].some((x) => x.slot_start === s.slot_start)) out[d].push(s);
    }
    return out;
  }
  function render() {
    const days = byDay();
    const end = addDays(st.week, 6);
    const isThisWeek = st.week === mondayOf(today);
    const list = days[st.day] || [];
    const parts = { "Mañana": [], "Tarde": [], "Noche": [] };
    list.forEach((s) => { const h = +hhmm(s.slot_start).slice(0, 2); parts[h < 12 ? "Mañana" : h < 18 ? "Tarde" : "Noche"].push(s); });
    el.innerHTML = `
      <div class="week">
        <div class="week__nav">
          <button type="button" class="icon-btn" data-wk="-1" aria-label="Semana anterior">‹</button>
          <div class="week__label"><strong>${fmtDay(st.week, { day: "numeric", month: "short" })} – ${fmtDay(end, { day: "numeric", month: "short", year: "numeric" })}</strong>
            ${isThisWeek ? `<span class="muted">Semana actual</span>` : `<button type="button" class="link-btn" data-wk="0">Volver a esta semana</button>`}</div>
          <button type="button" class="icon-btn" data-wk="1" aria-label="Semana siguiente">›</button>
        </div>
        <div class="week__days" role="tablist" aria-label="Días de la semana">
          ${Array.from({ length: 7 }, (_, i) => {
            const d = addDays(st.week, i), n = days[d]?.length || 0, past = d < today;
            return `<button type="button" role="tab" class="day${d === st.day ? " is-sel" : ""}${d === today ? " is-today" : ""}" data-day="${d}"
              aria-selected="${d === st.day}" ${past || (!n && !st.loading) ? "disabled" : ""}>
              <span class="day__n">${DAYS_SHORT[weekday(d)]}</span><span class="day__d">${+d.slice(8)}</span>
              <span class="day__c">${st.loading ? "·" : past ? "—" : n ? `${n}<span class="hide-sm"> libres</span>` : "—"}</span></button>`;
          }).join("")}
        </div>
        <div class="slots" aria-live="polite">
          ${st.loading ? loader("Buscando horarios…")
            : st.error ? `<p class="form-msg">${esc(st.error)} <button type="button" class="link-btn" data-retry>Reintentar</button></p>`
            : !list.length ? `<p class="muted slots__empty">${st.day < today ? "Esta fecha ya pasó." : "No hay horarios libres este día. Prueba otro día o la semana siguiente."}</p>`
            : `<p class="slots__day">${cap(fmtDay(st.day, { weekday: "long", day: "numeric", month: "long" }))}</p>` +
              Object.entries(parts).filter(([, v]) => v.length).map(([k, v]) => `<div class="slots__grp"><span>${k}</span><div class="slots__grid">${v.map((s) =>
                `<button type="button" class="slot${selected === s.slot_start || new Date(selected).getTime() === new Date(s.slot_start).getTime() ? " is-sel" : ""}" data-slot="${s.slot_start}" data-slot-barber="${s.barber_id}">${fmtTime(s.slot_start)}</button>`).join("")}</div></div>`).join("")}
        </div>
      </div>`;
  }
  el.addEventListener("click", (e) => {
    const wk = e.target.closest("[data-wk]");
    if (wk) { st.week = wk.dataset.wk === "0" ? mondayOf(today) : addDays(st.week, 7 * +wk.dataset.wk); st.day = null; return load(); }
    const day = e.target.closest("[data-day]");
    if (day) { st.day = day.dataset.day; return render(); }
    if (e.target.closest("[data-retry]")) return load();
    const slot = e.target.closest("[data-slot]");
    if (slot) { selected = slot.dataset.slot; render(); onPick({ start: slot.dataset.slot, barberId: barberId ? slot.dataset.slotBarber : null }); }
  });
  load();
  return { reload: load };
}

/* =========================== RESERVA ===========================
   La selección se guarda en sessionStorage: si el cliente debe iniciar sesión,
   al volver encuentra su servicio, barbero y hora ya elegidos. */
const KEY = "eb_reserva";
export const Booking = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } },
  set(v) { try { sessionStorage.setItem(KEY, JSON.stringify({ ...this.get(), ...v })); } catch {} },
  clear() { try { sessionStorage.removeItem(KEY); } catch {} }
};

export function viewBooking(query) {
  if (query.servicio) Booking.set({ serviceId: query.servicio, start: null });
  if (query.barbero) Booking.set({ barberId: query.barbero, start: null });
  return `<section class="book">
    <header class="book__head"><div class="wrap"><p class="label">Reserva en línea</p><h1>Agenda tu cita</h1><ol class="progress" id="progress" aria-label="Progreso"></ol></div></header>
    <div class="wrap book__grid">
      <div class="book__steps" id="steps"></div>
      <aside class="book__summary" id="summary" aria-label="Resumen de la reserva"></aside>
    </div>
    <div class="book-bar" id="bookBar" hidden></div></section>`;
}

const STEPS = ["Servicio", "Barbero", "Fecha y hora", "Confirmar"];
const thumb = (url, name, cls) => `<span class="${cls}">${safeUrl(url) ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc(initials(name))}</span>`}</span>`;

export function mountBooking() {
  const steps = $("#steps"), summary = $("#summary"), progress = $("#progress"), bar = $("#bookBar");
  const anyEnabled = R().cualquier_barbero !== false;
  let open = null;   // paso abierto a mano con "Cambiar"; null = el primero pendiente

  function validState() {
    const b = Booking.get();
    if (b.serviceId && !activeServices().some((s) => s.id === b.serviceId)) Booking.set({ serviceId: null, start: null });
    if (b.barberId && b.barberId !== "any" && !activeBarbers().some((x) => x.id === b.barberId)) Booking.set({ barberId: null, start: null });
    if (b.barberId === "any" && !anyEnabled) Booking.set({ barberId: null, start: null });
    if (b.start && new Date(b.start) < new Date()) Booking.set({ start: null });
    return Booking.get();
  }

  function render() {
    const b = validState();
    const svc = activeServices().find((s) => s.id === b.serviceId);
    const barber = activeBarbers().find((x) => x.id === b.barberId);
    const services = activeServices();
    const barbers = activeBarbers();
    if (!services.length || !barbers.length) {
      steps.innerHTML = emptyState("Las reservas en línea aún no están disponibles.", "Estamos configurando servicios y horarios. Escríbenos para agendar.",
        waLink() ? `<a class="btn" href="${esc(waLink())}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : "");
      summary.innerHTML = progress.innerHTML = ""; bar.hidden = true; return;
    }
    const done = [!!svc, !!(svc && b.barberId), !!(svc && b.barberId && b.start)];
    const pending = done.indexOf(false) + 1 || 4;
    const cur = open && open <= pending ? open : pending;
    const barberLabel = b.barberId === "any" ? "Cualquier barbero" : barber ? barber.name : "";
    const values = [svc?.name, barberLabel, b.start ? `${cap(fmtDay(ymd(new Date(b.start)), { weekday: "short", day: "numeric", month: "short" }))} · ${fmtTime(b.start)}` : ""];

    progress.innerHTML = STEPS.map((t, i) => `<li class="${i + 1 === cur ? "is-cur" : i < 3 && done[i] ? "is-done" : ""}"${i + 1 === cur ? ' aria-current="step"' : ""}><span>${i + 1}</span>${t}</li>`).join("");

    const step = (n, body) => {
      const isOpen = n === cur, isDone = n < 4 && done[n - 1], reachable = n <= pending;
      return `<section class="step${isOpen ? " is-open" : ""}${isDone ? " is-done" : ""}${reachable ? "" : " is-locked"}" aria-labelledby="st${n}">
        <header class="step__head"><span class="step__n">${isDone && !isOpen ? "✓" : n}</span><h2 id="st${n}">${STEPS[n - 1]}</h2>
          ${isDone && !isOpen ? `<span class="step__val">${esc(values[n - 1])}</span><button type="button" class="step__edit" data-open="${n}">Cambiar</button>` : ""}</header>
        ${isOpen ? `<div class="step__body">${body()}</div>` : ""}</section>`;
    };

    steps.innerHTML =
      step(1, () => `<div class="svc-cards">${services.map((s) => `
        <button type="button" class="svc-card${s.id === b.serviceId ? " is-sel" : ""}" data-svc="${s.id}" aria-pressed="${s.id === b.serviceId}">
          ${thumb(s.image_url, s.name, "svc-card__img")}
          <span class="svc-card__body"><strong>${esc(s.name)}</strong>${s.description ? `<small>${esc(s.description)}</small>` : ""}
            <span class="svc-card__meta"><span>${durLabel(s.duration_min)}</span><span class="${s.price == null ? "is-pending" : ""}">${priceLabel(s.price)}</span></span></span>
        </button>`).join("")}</div>`) +
      step(2, () => `<div class="barber-cards">
        ${anyEnabled ? `<button type="button" class="barber-card barber-card--any${b.barberId === "any" ? " is-sel" : ""}" data-barber="any" aria-pressed="${b.barberId === "any"}">
          <span class="barber-card__img"><span aria-hidden="true">—</span></span><span class="barber-card__body"><strong>Cualquier barbero</strong><small>Te asignamos el primero disponible</small></span></button>` : ""}
        ${barbers.map((x) => `<button type="button" class="barber-card${x.id === b.barberId ? " is-sel" : ""}" data-barber="${x.id}" aria-pressed="${x.id === b.barberId}">
          ${thumb(x.photo_url, x.name, "barber-card__img")}
          <span class="barber-card__body"><strong>${esc(x.name)}</strong><small>${esc(x.specialties?.length ? x.specialties.slice(0, 3).join(" · ") : barberWorkDays(x.id).join(" · ") || "Horario por confirmar")}</small></span></button>`).join("")}
      </div>`) +
      step(3, () => `<div id="picker"></div>`) +
      step(4, () => confirmBlock(b));

    summary.innerHTML = `<div class="ticket">
      ${svc && safeUrl(svc.image_url) ? `<img class="ticket__img" src="${esc(svc.image_url)}" alt="">` : ""}
      <p class="label">Tu reserva</p>
      <h2>${svc ? esc(svc.name) : "Elige un servicio"}</h2>
      <dl class="sum">
        <div><dt>Barbero</dt><dd>${barberLabel ? esc(barberLabel) : "—"}</dd></div>
        <div><dt>Fecha</dt><dd>${b.start ? esc(cap(fmtDate(b.start))) : "—"}</dd></div>
        <div><dt>Hora</dt><dd>${b.start ? fmtTime(b.start) : "—"}</dd></div>
        <div><dt>Duración</dt><dd>${svc ? durLabel(svc.duration_min) : "—"}</dd></div>
        <div class="sum__total"><dt>Precio</dt><dd>${svc ? priceLabel(svc.price) : "—"}</dd></div>
      </dl>
      <p class="ticket__note">Pagas en la barbería. Puedes cancelar o reprogramar hasta ${Number(R().cancelacion_min_horas ?? 2)} h antes desde tu cuenta.</p>
      ${N().direccion ? `<p class="ticket__note">${esc(N().direccion)}</p>` : ""}</div>`;

    bar.hidden = !svc;
    bar.innerHTML = svc ? `<div><strong>${esc(svc.name)}</strong><small>${esc([barberLabel, values[2]].filter(Boolean).join(" · ") || durLabel(svc.duration_min))}</small></div>
      <span class="book-bar__step">Paso ${cur} de 4</span>` : "";

    if (cur === 3) mountSlotPicker($("#picker"), {
      serviceId: svc.id, barberId: b.barberId === "any" ? null : b.barberId,
      date: b.start ? ymd(new Date(b.start)) : null, selected: b.start,
      onPick: ({ start }) => { Booking.set({ start }); go(null); }
    });
  }

  // Re-dibuja y lleva la vista al paso abierto (útil sobre todo en celular).
  function go(n) { open = n; render(); $(".step.is-open")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  function confirmBlock(b) {
    if (!State.user) return `<p>Para confirmar necesitas una cuenta. Tu selección queda guardada.</p>
      <div class="row"><a class="btn" href="#/cuenta?volver=reservar">Iniciar sesión</a><a class="btn btn--ghost" href="#/cuenta/registro?volver=reservar">Crear cuenta</a></div>`;
    return `<form id="confirmForm" class="form" novalidate>
      <label class="field"><span>Nota para el barbero (opcional)</span>
        <textarea name="notes" maxlength="500" rows="2" placeholder="Ej.: quiero mantener el largo arriba">${esc(b.notes || "")}</textarea></label>
      <p class="muted small">Reservas como <strong>${esc(State.profile?.full_name || State.user.email)}</strong>.</p>
      <button class="btn btn--lg btn--block" type="submit" data-busy="Confirmando…">Confirmar cita</button>
      <p class="form-msg" id="confirmMsg" role="alert"></p></form>`;
  }

  steps.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) return go(+o.dataset.open);
    const s = e.target.closest("[data-svc]");
    if (s) { Booking.set({ serviceId: s.dataset.svc, start: null }); return go(null); }
    const bb = e.target.closest("[data-barber]");
    if (bb) { Booking.set({ barberId: bb.dataset.barber, start: null }); return go(null); }
  });
  steps.addEventListener("input", (e) => { if (e.target.name === "notes") Booking.set({ notes: e.target.value }); });
  steps.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = Booking.get();
    await busy(e.submitter || $("#confirmForm button"), async () => {
      const { data, error } = await sb.rpc("book_appointment", {
        p_service: b.serviceId, p_barber: b.barberId === "any" ? null : b.barberId, p_start: b.start, p_notes: b.notes || null
      });
      if (error) {
        setMsg($("#confirmMsg"), friendly(error));
        if (/HORARIO_OCUPADO|ANTICIPACION|BLOQUEADO|FUERA_DE_HORARIO/.test(error.message)) { Booking.set({ start: null }); toast(friendly(error), "err"); go(null); }
        return;
      }
      Booking.clear();
      location.hash = `#/reserva/${data}`;
    });
  });
  render();
}

/* Confirmación visual después de reservar (lee la cita real desde Supabase). */
export async function viewBooked(id) {
  const { data: a, error } = await sb.from("appointments").select("*").eq("id", id).maybeSingle();
  if (error || !a) return `<section class="wrap narrow">${emptyState("No encontramos esa reserva.", "", `<a class="btn" href="#/cuenta">Ver mis citas</a>`)}</section>`;
  const pend = a.status === "pendiente";
  return `<section class="wrap done">
    <div class="done__head"><p class="label">${pend ? "Reserva recibida" : "Cita confirmada"}</p>
      <h1>${pend ? "Tu cita está pendiente de confirmación" : "Te esperamos"}</h1></div>
    <div class="done__ticket">
      <div class="done__date"><span>${esc(cap(fmtDay(ymd(new Date(a.starts_at)), { weekday: "long" })))}</span><strong>${+ymd(new Date(a.starts_at)).slice(8)}</strong><span>${esc(fmtDay(ymd(new Date(a.starts_at)), { month: "long", year: "numeric" }))}</span></div>
      <dl class="sum">
        <div><dt>Hora</dt><dd>${fmtTime(a.starts_at)} – ${fmtTime(a.ends_at)}</dd></div>
        <div><dt>Servicio</dt><dd>${esc(a.service_name)} · ${durLabel(a.duration_min)}</dd></div>
        <div><dt>Barbero</dt><dd>${esc(a.barber_name)}</dd></div>
        <div><dt>Precio</dt><dd>${priceLabel(a.price)}</dd></div>
        ${N().direccion ? `<div><dt>Lugar</dt><dd>${esc(N().direccion)}</dd></div>` : ""}
      </dl>
    </div>
    ${pend ? `<p class="muted">La barbería confirmará tu cita pronto. Si no se confirma antes de ${esc(fmtDateTime2(a.pending_expires_at))}, el horario se libera.</p>` : ""}
    <div class="row"><a class="btn" href="#/cuenta">Ver mis citas</a><a class="btn btn--ghost" href="#/">Volver al inicio</a></div>
  </section>`;
}
const fmtDateTime2 = (d) => d ? `${fmtDate(d)} ${fmtTime(d)}` : "";
