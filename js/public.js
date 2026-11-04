/* Web pública: inicio, flujo de reserva y selector semanal de horarios. */
import {
  sb, State, $, $$, esc, safeUrl, money, priceLabel, durLabel, DAYS, DAYS_SHORT, todayYmd, addDays, mondayOf, weekday,
  fmtDay, fmtTime, fmtDate, hhmm, ymd, friendly, toast, loader, emptyState, busy, scheduleByDay, barberWorkDays, waLink, setMsg,
  mapAllowed, consentChecks, consentMissing, logConsent, loadProfile, formData, extrasText, extrasTotal, modal, minutes
} from "./core.js?v=20261104b";

const N = () => State.settings.negocio || {};
const R = () => State.settings.reservas || {};
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const activeServices = () => State.services.filter((s) => s.active);
const activeBarbers = () => State.barbers.filter((b) => b.active);
const mapUrl = () => safeUrl(N().mapa_url) ||
  (N().direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([N().direccion, N().ciudad].filter(Boolean).join(", "))}` : "");

/* =========================== INICIO ===========================
   Portada en paneles con slider, la barbería, catálogo de servicios,
   barberos, Instagram y visítanos con mapa. Solo datos reales del panel;
   las fotos de ambiente se reemplazan al subir las propias. */
const igName = (u) => (String(u || "").match(/instagram\.com\/([^/?#]+)/i) || [])[1] || "";
// Fotos de ambiente (Unsplash, licencia libre): no son del local.
const F = (n) => `assets/fotos/${n}.jpg`;
const STOCK = { afeitado: F("afeitado") };
const REAL = (n) => F(`real-${n}`);   // fotos reales de la barbería
const head = (title, id, link = "") => `<header class="lp-head rv"><h2${id ? ` id="${id}"` : ""}>${title}</h2>${link}</header>`;
const words = (t) => esc(t).split(/\s+/).map((w, k) => `<span class="w"><span style="--i:${k}">${w}</span></span>`).join(" ");
const ICON = {
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.3 7.9L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>`
};

export function viewHome() {
  const n = N(), r = R();
  const services = activeServices();
  const barbers = activeBarbers();
  const gallery = State.gallery.filter((g) => g.active);
  const hours = scheduleByDay(null);
  const hasHours = hours.some((d) => d.length);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dow = weekday(todayYmd()), nowM = minutes(hhmm(new Date()));
  // shortcut: no mira cierres ni festivos del panel (time_off no se carga en la web pública); solo el horario semanal.
  const isOpen = State.schedules.some((s) => !s.barber_id && s.weekday === dow && nowM >= minutes(s.start_time) && nowM < minutes(s.end_time));
  const cats = State.categories.filter((c) => c.active && services.some((s) => s.category_id === c.id));
  const uncategorized = services.filter((s) => !cats.some((c) => c.id === s.category_id));
  const heroImg = safeUrl(n.hero_imagen);
  const ig = safeUrl(n.instagram), igH = igName(n.instagram);
  const wa = waLink();
  const brand = n.nombre_largo || "The Elegance Of The Barber's";
  const slogan = n.eslogan || "Tu mejor opción.";
  const minAnt = Number(r.anticipacion_min_minutos);
  const rules = [
    r.cancelacion_min_horas != null && `Cancela${r.reprogramacion_permitida === false ? "" : " o reprograma"} hasta ${r.cancelacion_min_horas} h antes.`,
    r.anticipacion_min_minutos != null && `Reserva con ${minAnt >= 60 && minAnt % 60 === 0 ? `${minAnt / 60} h` : `${minAnt} min`} de anticipación${r.anticipacion_max_dias ? `, hasta ${r.anticipacion_max_dias} días antes` : ""}.`,
    r.confirmacion_automatica === false ? "La barbería confirma tu cita." : "Confirmación inmediata."
  ].filter(Boolean);
  const slides = [
    { kicker: "Barbería", title: ["The Elegance", "of the Barber's"], imgs: [heroImg || F("hero-fade"), F("hero-navaja"), F("hero-local"), F("hero-guantes")] },
    { kicker: brand, title: [slogan], imgs: [F("svc-fade"), F("cliente"), F("svc-afinar"), F("svc-barba")] }
  ];
  const pillars = [
    [ICON.cal, "Reserva en línea", "Eliges servicio, barbero y hora desde el celular, sin llamadas."],
    [ICON.user, "Tu barbero", `Reserva con quien prefieras${r.cualquier_barbero === false ? "." : " o con el primero disponible."}`],
    r.confirmacion_automatica === false ? [ICON.check, "Te confirmamos", "La barbería revisa y confirma tu cita."] : [ICON.check, "Confirmación inmediata", "Tu cita queda lista al instante."],
    r.cancelacion_min_horas != null && [ICON.clock, "Cambios sin enredos", `Cancela${r.reprogramacion_permitida === false ? "" : " o reprograma"} desde tu cuenta hasta ${r.cancelacion_min_horas} h antes.`]
  ].filter(Boolean);
  // Trabajos reales: fotos de la Galería primero, luego videos y fotos de la barbería.
  const igTiles = [...gallery.map((g) => g.image_url), "assets/videos/trabajo-1.mp4", REAL("mullet-fade"), "assets/videos/trabajo-2.mp4",
    REAL("mohicano-joven"), "assets/videos/trabajo-3.mp4", REAL("linea-celular")].slice(0, 6);
  const BARBER_BG = ["tijeras", "silla", "svc-peine", "svc-guantes"].map(F);
  const place = [n.direccion, n.ciudad].filter(Boolean).join(", ");
  const mapQ = place ? (n.ciudad ? place : `${place}, Colombia`) : "";

  return `
  <section class="hx" id="inicio" aria-roledescription="carrusel" aria-label="Portada">
    ${slides.map((s, i) => `
    <div class="hx__slide${i ? "" : " is-on"}" data-slide="${i}" ${i ? "inert" : ""}>
      <div class="hx__panels" aria-hidden="true">${s.imgs.map((src, k) => `<div class="hx__panel" style="--k:${k}"><img src="${esc(src)}" alt="" ${i ? `loading="lazy"` : k ? "" : `fetchpriority="high"`}></div>`).join("")}</div>
      <div class="hx__copy wrap">
        <p class="hx__kicker">${esc(s.kicker)}</p>
        <${i ? "p" : "h1"} class="hx__title">${s.title.map((t, k) => `<span class="ln${k ? " ln--sub" : ""}"><span>${esc(t)}</span></span>`).join("")}</${i ? "p" : "h1"}>
        <div class="hx__cta"><a class="btn btn--light btn--lg" href="#/reservar">Reservar cita</a><a class="link-line link-line--light" href="#/inicio/servicios">Ver servicios</a></div>
      </div>
    </div>`).join("")}
    <div class="hx__dots" role="group" aria-label="Elegir portada">${slides.map((_, i) => `<button type="button" data-go="${i}" aria-label="Portada ${i + 1}" ${i ? "" : `aria-current="true"`}></button>`).join("")}</div>
  </section>

  <section class="about" id="nosotros" aria-labelledby="t-about">
    <div class="about__marquee" aria-hidden="true"><div data-scrollx>${Array(4).fill(`<span>Elegance</span><i>✦</i><span class="o">Barber</span><i>✦</i>`).join("")}</div></div>
    <div class="wrap about__grid">
      <div class="about__badge rv" aria-hidden="true">
        <svg viewBox="0 0 200 200"><defs><path id="ring" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs>
          <text><textPath href="#ring" textLength="500">${esc(brand)} ✦ ${esc(slogan)} ✦</textPath></text></svg>
        <img src="assets/logo-crown-light.png" alt="">
      </div>
      <div class="about__copy">
        <p class="eyebrow-lp rv">La barbería</p>
        <h2 id="t-about" class="about__title rv-split">${words(slogan)}</h2>
        <div class="about__text rv" style="--i:2">
          ${n.filosofia ? n.filosofia.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("") : `<p>${esc(brand)}${n.direccion ? `. Te esperamos en ${esc(n.direccion)}` : ""}.</p>`}
          <a class="btn btn--light" href="#/reservar">Agenda tu visita</a>
        </div>
      </div>
    </div>
    <ul class="wrap pillars">${pillars.map(([ic, t, d], k) => `<li class="pillar rv" style="--i:${k}"><span class="pillar__ic">${ic}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("")}</ul>
  </section>

  <section class="section section--paper" id="servicios" aria-labelledby="t-serv">
    <div class="wrap">
      ${head("Servicios y precios", "t-serv", `<a class="lp-link" href="#/reservar">Reservar ahora</a>`)}
      ${cats.length > 1 ? `<div class="chips rv" role="group" aria-label="Filtrar servicios"><button type="button" class="chip is-on" data-cat-filter="" aria-pressed="true">Todos</button>${cats.map((c) => `<button type="button" class="chip" data-cat-filter="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join("")}</div>` : ""}
      ${services.length ? `<ul class="catalog">${[...cats.flatMap((c) => services.filter((s) => s.category_id === c.id)), ...uncategorized]
        .map((s, k) => menuItem(s, k, cats.find((c) => c.id === s.category_id)?.name)).join("")}</ul>`
        : `<p class="muted">Estamos actualizando servicios y precios.${wa ? ` <a href="${esc(wa)}" target="_blank" rel="noopener">Pregunta por WhatsApp</a>.` : ""}</p>`}
    </div>
  </section>

  <section class="section" id="tienda" aria-labelledby="t-shop">
    <div class="wrap">
      ${head("Para después del corte", "t-shop", "")}
      <p class="muted rv" style="margin:-8px 0 22px">Snacks y bebidas para disfrutar en la barbería. Se pagan allá, junto con tu servicio.</p>
      <div class="chips rv" role="group" aria-label="Filtrar productos"><button type="button" class="chip is-on" data-cat-filter="" aria-pressed="true">Todos</button>${Object.keys(SHOP).map((c) => `<button type="button" class="chip" data-cat-filter="${c}" aria-pressed="false">${c}</button>`).join("")}</div>
      <ul class="catalog">${SHOP_LIST.map(shopCard).join("")}</ul>
    </div>
  </section>

  <section class="section" id="barberos" aria-labelledby="t-barb">
    <div class="wrap">${head("Nuestros barberos", "t-barb", barbers.length ? `<a class="lp-link" href="#/reservar">Reservar con tu barbero</a>` : "")}</div>
    ${barbers.length ? `<div class="crew" tabindex="0" aria-label="Barberos">${barbers.map((b, k) => {
      const photo = safeUrl(b.photo_url);
      const days = barberWorkDays(b.id);
      return `<article class="crew__card rv" style="--i:${k % 4}">
        <img src="${esc(photo || BARBER_BG[k % BARBER_BG.length])}" alt="${photo ? esc(b.name) : ""}" loading="lazy"${photo ? "" : ` class="is-stock"`}>
        <div class="crew__info"><h3>${esc(b.name)}</h3><p>${b.specialties?.length ? esc(b.specialties.join(" · ")) : days.length ? esc(days.join(" · ")) : ""}</p>
          <a class="crew__btn" href="#/reservar?barbero=${b.id}">Reservar</a></div>
      </article>`;
    }).join("")}</div>` : `<div class="wrap"><p class="muted">Pronto presentaremos a nuestro equipo.</p></div>`}
  </section>

  <section class="cta" aria-labelledby="t-book">
    <div class="cta__bg" aria-hidden="true"><img src="${esc(STOCK.afeitado)}" alt="" loading="lazy"></div>
    <div class="wrap cta__in rv">
      <h2 id="t-book">Reserva tu próxima cita</h2>
      <ul>${rules.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <a class="btn btn--light btn--lg" href="#/reservar">Reservar ahora</a>
    </div>
  </section>

  ${ig || gallery.length ? `
  <section class="insta" id="galeria" aria-labelledby="t-ig">
    <div class="wrap">${head(igH ? `@${esc(igH)}` : "Nuestros trabajos", "t-ig", ig ? `<a class="lp-link" href="${esc(n.instagram)}" target="_blank" rel="noopener">Síguenos en Instagram</a>` : "")}</div>
    <div class="insta__grid">${igTiles.map((src, k) => `<a class="insta__tile rv" style="--i:${k}" ${ig ? `href="${esc(n.instagram)}" target="_blank" rel="noopener"` : `href="#/reservar"`} aria-label="${ig ? "Ver Instagram" : "Reservar"}">${/\.mp4$/.test(src)
      ? `<video src="${esc(src)}" poster="${esc(src.replace(/mp4$/, "jpg"))}" muted loop playsinline preload="none" aria-hidden="true"></video>`
      : `<img src="${esc(src)}" alt="" loading="lazy">`}<span>${ICON.ig}</span></a>`).join("")}</div>
  </section>` : ""}

  <section class="visit" id="visitanos" aria-labelledby="t-visit" style="--vbg:url('${esc(new URL(F("hero-local"), document.baseURI).href)}')">
    <div class="wrap">
      <header class="visit__top rv">
        <div><p class="visit__kick">Visítanos</p><h2 id="t-visit">${place ? esc(n.direccion) : "Te esperamos"}</h2></div>
        ${hasHours ? `<span class="visit__state ${isOpen ? "is-open" : ""}"><i></i>${isOpen ? "Abierto ahora" : "Cerrado ahora"}</span>` : ""}
      </header>
      <div class="visit__grid">
        ${mapQ ? `<div class="visit__map rv">
          ${mapAllowed() ? `<iframe title="Mapa: ${esc(place)}" src="https://maps.google.com/maps?q=${encodeURIComponent(mapQ)}&z=16&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
            : `<div class="visit__nomap"><p>El mapa lo carga Google, que usa sus propias cookies.</p><button type="button" class="btn btn--sm" data-cookies="all">Ver mapa</button><a class="link-line" href="#/legal/cookies">Política de cookies</a></div>`}
        </div>` : ""}
        <div class="visit__side">
          <div class="vacts rv">
            ${mapQ ? `<button type="button" class="vact vact--main" data-route-open>${ICON.pin}<b>Cómo llegar</b><small>Google Maps o Waze</small></button>` : ""}
            <a class="vact" href="#/reservar">${ICON.cal}<b>Reservar</b><small>Eliges barbero y hora</small></a>
            ${wa ? `<a class="vact" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.chat}<b>WhatsApp</b><small>Escríbenos</small></a>` : ""}
            ${ig ? `<a class="vact" href="${esc(n.instagram)}" target="_blank" rel="noopener">${ICON.ig}<b>Instagram</b><small>${igH ? `@${esc(igH)}` : "Síguenos"}</small></a>` : ""}
          </div>
          <div class="vhours rv" id="horario"><h3>Horario</h3>
            ${hasHours ? `<dl>${order.map((d) => `<div class="${d === dow ? "is-today" : ""}"><dt>${DAYS[d]}${d === dow ? " <em>Hoy</em>" : ""}</dt><dd>${hours[d].length ? esc(hours[d].join(" · ")) : "Cerrado"}</dd></div>`).join("")}</dl>` : `<p>Por confirmar</p>`}
          </div>
          ${n.telefono || n.correo ? `<p class="visit__contact rv">${n.telefono ? `<a href="tel:${esc(String(n.telefono).replace(/[^\d+]/g, ""))}">${esc(n.telefono)}</a>` : ""}${n.correo ? `<a href="mailto:${esc(n.correo)}">${esc(n.correo)}</a>` : ""}</p>` : ""}
        </div>
      </div>
      ${mapQ ? `<dialog class="route-dlg" id="routeDlg" aria-labelledby="t-route">
        <p class="eyebrow-lp">Cómo llegar</p>
        <h3 id="t-route">${esc(place)}</h3>
        <div class="route-dlg__opts">
          <a class="route-opt" href="${esc(mapUrl() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQ)}`)}" target="_blank" rel="noopener"><b>Google Maps</b><small>Abrir ruta</small></a>
          <a class="route-opt" href="https://waze.com/ul?q=${encodeURIComponent(mapQ)}&navigate=yes" target="_blank" rel="noopener"><b>Waze</b><small>Abrir ruta</small></a>
        </div>
        <button type="button" class="link-line" data-route-close>Cerrar</button>
      </dialog>` : ""}
    </div>
  </section>`;
}

// Slider de la portada: cambia cada 6 s, se pausa al pasar el mouse o con el foco.
export function mountHome() {
  // Videos de trabajos: se reproducen solo cuando se ven (y nunca con movimiento reducido).
  const vids = $$(".insta__tile video");
  if (vids.length && !matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    const vo = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause())), { threshold: 0.3 });
    vids.forEach((v) => {
      vo.observe(v);
      if (v.src.endsWith("trabajo-3.mp4")) v.addEventListener("timeupdate", () => { if (v.currentTime > 9.8) v.currentTime = 0; });   // corta el cierre de CapCut
    });
  }
  const hx = $(".hx");
  if (!hx) return;
  const slides = $$(".hx__slide", hx), dots = $$("[data-go]", hx);
  let cur = 0, timer = null;
  const go = (i) => {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle("is-on", k === cur); s.inert = k !== cur; });
    dots.forEach((d, k) => d.toggleAttribute("aria-current", k === cur));
  };
  const play = () => { clearInterval(timer); if (!matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(() => document.body.contains(hx) ? go(cur + 1) : clearInterval(timer), 6000); };
  dots.forEach((d) => d.addEventListener("click", () => { go(+d.dataset.go); play(); }));
  hx.addEventListener("mouseenter", () => clearInterval(timer));
  hx.addEventListener("mouseleave", play);
  hx.addEventListener("focusin", () => clearInterval(timer));
  play();
}

// shortcut: productos fijos en código (lista enviada por el dueño); pasarlos a Supabase si el dueño quiere editarlos desde el panel.
export const SHOP = {
  Snacks: [["Detodito", 3500, "detodito"], ["Margaritas (pollo, limón, tomate…)", 3000, "margaritas"], ["Natuchip", 3000, "natuchip"], ["Boliquesos", 2500, "boliquesos"],
    ["Doritos", 3000, "doritos"], ["Cheestris", 2500, "cheestre"], ["Choclitos", 2500, "choclitos"], ["Maní", 2000, "manis"], ["Chokis", 2000, "chockis"]],
  Cervezas: [["Coronita", 4500, "coronita"], ["Club Colombia", 4500, "club-colombia"], ["Stella Artois botella", 6000, "stella-botella"], ["Stella Artois lata", 5000, "stella-lata"],
    ["Costeña", 4000, "costena"], ["Miller Lite", 4000, "miller-lite"]],
  Gaseosas: [["Coca-Cola personal", 3500, "coca-cola"], ["Coca-Cola Zero pequeña", 2000, "coca-zero"], ["Agua saborizada pequeña", 2000, "agua-saborizada"],
    ["Ginger personal", 3000, "ginger"], ["Sprite personal", 3000, "sprite"], ["Quatro personal", 3000, "quatro-personal"], ["Kola Román pequeña", 2000, "kola-roman"],
    ["Jugo del Valle", 3500, "jugo-del-valle"], ["Agua personal", 2000, "agua"], ["Quatro pequeña", 2000, "quatro-pequena"], ["Speed Max", 2500, "speed-max"], ["Soda", 3000, "soda"]]
};

export const SHOP_ITEMS = Object.values(SHOP).flat();
const SHOP_LIST = Object.entries(SHOP).flatMap(([c, l]) => l.map(([n, p, img]) => ({ n, p, img, c })));
const pkImg = (img, alt = "") => `<span class="pk"><img src="assets/tienda/${img}.jpg?v=2" alt="${esc(alt)}" loading="lazy"></span>`;   // solo el panel blanco con el empaque
const fold = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function shopCard(x, k = 0) {
  return `<li class="rv" style="--i:${k % 4}" data-cat="${x.c}"><div class="cat-card cat-card--shop">
    <a class="cat-card__img" href="#/producto/${x.img}" tabindex="-1" aria-hidden="true"><img src="assets/tienda/${x.img}.jpg?v=2" alt="" loading="lazy"><span class="cat-card__tag">${x.c}</span></a>
    <div class="cat-card__body"><h4><a href="#/producto/${x.img}">${esc(x.n)}</a></h4><div class="cat-card__foot"><span class="cat-card__price">${money(x.p)}</span><button type="button" class="cart-add" data-cart-x="${esc(x.n)}" aria-label="Agregar ${esc(x.n)} al carrito">+ Agregar</button></div></div></div></li>`;
}

/* Página de un producto (snack o bebida), estilo tienda. */
export function viewProduct(slug) {
  const x = SHOP_LIST.find((i) => i.img === slug);
  if (!x) return `<section class="wrap narrow">${emptyState("Este producto no está disponible.", "", `<a class="btn" href="#/inicio/tienda">Ver productos</a>`)}</section>`;
  const q = Booking.get().extras?.[x.n] || 0, wa = waLink();
  const others = SHOP_LIST.filter((i) => i.c === x.c && i.img !== x.img).slice(0, 4);
  return `<section class="wrap pdp">
    <nav class="pdp__crumbs" aria-label="Ruta"><a href="#/">Inicio</a> / <a href="#/inicio/tienda">Snacks y bebidas</a> / <span>${esc(x.c)}</span></nav>
    <div class="pdp__grid">
      <figure class="pdp__img pdp__img--pk">${pkImg(x.img, x.n)}</figure>
      <div class="pdp__info">
        <p class="label">${esc(x.c)}</p>
        <h1>${esc(x.n)}</h1>
        <p class="pdp__price">${money(x.p)}</p>
        <p class="muted small">Precios en COP · Te lo entregamos en tu cita · Se paga en la barbería</p>
        <div class="pdp__qty"><span>En tu carrito</span><span class="qty"><button type="button" data-cx="${esc(x.n)}" data-d="-1" aria-label="Quitar uno">−</button><b data-cxn="${esc(x.n)}">${q}</b><button type="button" data-cx="${esc(x.n)}" data-d="1" aria-label="Agregar uno">+</button></span></div>
        <div class="pdp__acts">
          <button type="button" class="btn btn--lg btn--block" data-cart-x="${esc(x.n)}">Agregar al carrito</button>
          <a class="btn btn--lg btn--block btn--ghost" href="#/reservar">Reservar mi cita</a>
          ${wa ? `<a class="btn btn--block btn--ghost" href="${esc(wa)}" target="_blank" rel="noopener">Preguntar por WhatsApp</a>` : ""}
        </div>
        <details class="pdp__more" open><summary>Detalles</summary><ul>
          <li>Categoría: ${esc(x.c)}</li>
          <li>Lo pides junto con tu reserva y te lo entregamos en la barbería.</li>
          <li>Pagas en la barbería, junto con tu servicio.</li>
          <li>Hasta 10 unidades por producto.</li>
          ${x.c === "Cervezas" ? "<li>Venta solo a mayores de edad.</li>" : ""}
        </ul></details>
      </div>
    </div>
    ${others.length ? `<h2 class="pdp__rel">Más ${esc(x.c.toLowerCase())}</h2><ul class="catalog">${others.map(shopCard).join("")}</ul>` : ""}
  </section>`;
}

/* Tienda en ventana: buscador, categorías y cantidades. onClose: para que la reserva actualice su total. */
function openShop(onClose) {
  const ex = Booking.get().extras || {};
  const m = modal(`<h2 class="modal__t">Snacks y bebidas</h2>
    <p class="muted small" style="margin:-8px 0 14px">Te los entregamos en tu cita y se pagan en la barbería.</p>
    <input type="search" class="shop__search" placeholder="Buscar: Coronita, Doritos, agua…" aria-label="Buscar producto">
    <div class="chips shop__chips" role="group" aria-label="Categorías"><button type="button" class="chip is-on" data-sc="">Todos</button>${Object.keys(SHOP).map((c) => `<button type="button" class="chip" data-sc="${c}">${c}</button>`).join("")}</div>
    <ul class="shop__grid">${SHOP_LIST.map((x) => `<li data-c="${x.c}" data-f="${esc(fold(x.n + " " + x.c))}" class="${ex[x.n] ? "is-in" : ""}">
      <a href="#/producto/${x.img}" data-close>${pkImg(x.img)}</a>
      <span class="shop__name">${esc(x.n)}</span><span class="shop__price">${money(x.p)}</span>
      <span class="qty"><button type="button" data-sx="${esc(x.n)}" data-d="-1" aria-label="Quitar ${esc(x.n)}" ${ex[x.n] ? "" : "disabled"}>−</button><b>${ex[x.n] || 0}</b><button type="button" data-sx="${esc(x.n)}" data-d="1" aria-label="Agregar ${esc(x.n)}">+</button></span></li>`).join("")}</ul>
    <p class="muted shop__none" hidden>No encontramos ese producto.</p>
    <div class="shop__foot"><span id="shopSum"></span><button type="button" class="btn" data-close>Listo</button></div>`, { wide: true, onClose: () => { refreshCart(); onClose?.(); } });
  const el = m.el, sum = () => { const e = Booking.get().extras || {}, n = Object.values(e).reduce((t, v) => t + v, 0); $("#shopSum", el).innerHTML = n ? `${n} producto${n > 1 ? "s" : ""} · <strong>${money(extrasSum(e))}</strong>` : "Elige lo que quieras"; };
  let cat = "";
  const filter = () => {
    const t = fold($(".shop__search", el).value.trim());
    let shown = 0;
    $$(".shop__grid li", el).forEach((li) => { li.hidden = (cat && li.dataset.c !== cat) || (t && !li.dataset.f.includes(t)); if (!li.hidden) shown++; });
    $(".shop__none", el).hidden = !!shown;
  };
  $(".shop__search", el).addEventListener("input", filter);
  el.addEventListener("click", (e) => {
    const c = e.target.closest("[data-sc]");
    if (c) { cat = c.dataset.sc; $$("[data-sc]", el).forEach((b) => b.classList.toggle("is-on", b === c)); return filter(); }
    const b = e.target.closest("[data-sx]");
    if (!b) return;
    const n = b.dataset.sx, li = b.closest("li"), q = addExtra(n, +b.dataset.d)[n] || 0;
    $("b", li).textContent = q; $("[data-d='-1']", li).disabled = !q; li.classList.toggle("is-in", !!q);
    refreshCart(); sum();
  });
  sum();
}

// Invitación a la tienda dentro de la reserva.
function extrasPromo(ex = {}) {
  const n = Object.values(ex).reduce((t, v) => t + v, 0);
  return `<button type="button" class="xpromo${n ? " is-in" : ""}" id="exPromo" data-shop-open>
    <span class="xpromo__pics" aria-hidden="true">${["coronita", "doritos", "coca-cola", "detodito", "club-colombia"].map((i) => pkImg(i)).join("")}</span>
    <span class="xpromo__txt"><b>${n ? "Tus adicionales" : "¿Antojo para después del corte?"}</b>
      <small>${n ? esc(SHOP_ITEMS.filter(([k]) => ex[k]).map(([k]) => `${ex[k]}× ${k}`).join(", ")) : "Cervezas, gaseosas y snacks listos en tu cita"}</small></span>
    <span class="xpromo__cta">${n ? `${money(extrasSum(ex))} · Cambiar` : "Ver productos"} →</span>
  </button>`;
}
const MAX_SVC = () => 10;   // servicios por visita (book_cart acepta hasta 10)
const cartSvcs = (b = Booking.get()) => (b.serviceIds || []).map((id) => activeServices().find((s) => s.id === id)).filter(Boolean);
const extrasSum = (ex = {}) => SHOP_ITEMS.reduce((t, [n, p]) => t + (ex[n] || 0) * p, 0);
export const cartCount = () => { const b = Booking.get(); return cartSvcs(b).length + Object.values(b.extras || {}).reduce((t, q) => t + q, 0); };

function addService(id) {
  const ids = cartSvcs().map((s) => s.id);
  if (ids.includes(id)) return true;
  if (ids.length >= MAX_SVC()) { toast(`Puedes reservar hasta ${MAX_SVC()} servicios a la vez.`, "err"); return false; }
  Booking.set({ serviceIds: [...ids, id], start: null });
  return true;
}
function addExtra(n, d) {
  const ex = { ...(Booking.get().extras || {}) };
  ex[n] = Math.min(10, Math.max(0, (ex[n] || 0) + d)); if (!ex[n]) delete ex[n];
  Booking.set({ extras: ex });
  return ex;
}

function cartHtml() {
  const b = Booking.get(), svcs = cartSvcs(b), ex = b.extras || {};
  const snacks = SHOP_ITEMS.filter(([n]) => ex[n]);
  const sSum = svcs.reduce((t, s) => t + Number(s.price || 0), 0), xSum = extrasSum(ex);
  if (!svcs.length && !snacks.length) return `<div class="cart__empty"><p>Tu carrito está vacío.</p><a class="btn btn--block" href="#/inicio/servicios" data-cart-close>Ver servicios</a>
    <button type="button" class="xpromo xpromo--sm" data-shop-open><span class="xpromo__txt"><b>Snacks y bebidas</b><small>Cervezas, gaseosas y snacks para tu cita</small></span><span class="xpromo__cta">Ver →</span></button></div>`;
  const item = (href, pic, name, price, meta, acts) => `<li class="ci"><a class="ci__pic" href="${href}" data-cart-close tabindex="-1" aria-hidden="true">${pic}</a>
    <div class="ci__body"><div class="ci__top"><a class="ci__name" href="${href}" data-cart-close>${esc(name)}</a><span class="ci__price">${price}</span></div><p class="ci__meta">${meta}</p><div class="ci__acts">${acts}</div></div></li>`;
  return `<ul class="cart__list">
    ${svcs.map((s) => item(`#/servicio/${s.id}`, `<img src="${esc(svcPhoto(s))}" alt="">`, s.name, priceLabel(s.price), "Servicio",
      `<span></span><button type="button" class="ci__rm" data-cart-rm="${s.id}" aria-label="Eliminar ${esc(s.name)}">Eliminar</button>`)).join("")}
    ${snacks.map(([n, p, img]) => item(`#/producto/${img}`, `<img src="assets/tienda/mini/${img}.jpg" alt="">`, n, money(p * ex[n]), `${money(p)} c/u`,
      `<span class="qty qty--box"><button type="button" data-cx="${esc(n)}" data-d="-1" aria-label="Quitar uno">−</button><b>${ex[n]}</b><button type="button" data-cx="${esc(n)}" data-d="1" aria-label="Agregar uno">+</button></span><button type="button" class="ci__rm" data-cx="${esc(n)}" data-d="-10" aria-label="Eliminar ${esc(n)}">Eliminar</button>`)).join("")}
  </ul>
  <button type="button" class="xpromo xpromo--sm" data-shop-open><span class="xpromo__txt"><b>+ Snacks y bebidas</b><small>Cervezas, gaseosas y snacks para tu cita</small></span><span class="xpromo__cta">Ver →</span></button>
  <div class="cart__foot">
    ${svcs.length ? `<p class="cart__row"><span>Servicios</span><span>${money(sSum)}</span></p>` : ""}
    ${snacks.length ? `<p class="cart__row"><span>Snacks y bebidas</span><span>${money(xSum)}</span></p>` : ""}
    ${svcs.length ? `<p class="cart__row"><span>Tu cita dura</span><span>${durLabel(Math.max(...svcs.map((s) => s.duration_min)))} en total</span></p>` : ""}
    <p class="cart__row"><span>Pago</span><span class="muted">En la barbería</span></p>
    <p class="cart__total"><span>Total</span><strong>${money(sSum + xSum)}</strong></p>
    ${svcs.length ? `<a class="btn btn--lg btn--block" href="#/reservar" data-cart-close>Reservar · elegir barbero y hora</a>`
      : `<p class="muted small">Agrega al menos un servicio para reservar; los snacks se entregan en tu cita.</p><a class="btn btn--lg btn--block" href="#/inicio/servicios" data-cart-close>Ver servicios</a>`}
    <button type="button" class="cart__clear" data-cart-empty>Vaciar carrito</button>
  </div>`;
}
export function refreshCart() {
  const n = cartCount();
  document.querySelectorAll("[data-cart-n]").forEach((el) => { el.textContent = n; el.hidden = !n; });
  document.querySelectorAll("[data-cart-c]").forEach((el) => { el.textContent = n ? `(${n})` : ""; });
  const body = $("#cartBody"); if (body) body.innerHTML = cartHtml();
  const ex = Booking.get().extras || {};
  document.querySelectorAll("[data-cxn]").forEach((el) => { el.textContent = ex[el.dataset.cxn] || 0; });
}
function toggleCart(open) {
  const c = $("#cart"); if (!c) return;
  c.hidden = !open; document.body.classList.toggle("no-scroll", open);
  if (open) { refreshCart(); $(".drawer__x", c)?.focus(); }
  else if (location.hash.startsWith("#/reservar")) window.dispatchEvent(new HashChangeEvent("hashchange"));   // la reserva toma los cambios del carrito
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#cart") && !$("#cart").hidden) toggleCart(false); });

// Filtro del catálogo y elección de ruta (delegados: el inicio se vuelve a pintar en cada navegación).
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat-filter]");
  if (b) {
    const sec = b.closest("section");   // servicios y tienda filtran cada uno su propio catálogo
    sec.querySelectorAll("[data-cat-filter]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
    sec.querySelectorAll(".catalog > li").forEach((li) => { li.hidden = !!b.dataset.catFilter && li.dataset.cat !== b.dataset.catFilter; });
  }
  if (e.target.closest("[data-cart-open]")) return toggleCart(true);
  if (e.target.closest("[data-cart-close]")) toggleCart(false);
  const cs = e.target.closest("[data-cart-svc]");
  if (cs && addService(cs.dataset.cartSvc)) { toggleCart(true); if (cs.closest(".pdp__acts")) cs.textContent = "✓ Ya está en tu carrito"; }
  const cx = e.target.closest("[data-cart-x]");
  if (cx) { addExtra(cx.dataset.cartX, 1); toggleCart(true); refreshCart(); }
  const rm = e.target.closest("[data-cart-rm]");
  if (rm) { Booking.set({ serviceIds: cartSvcs().map((s) => s.id).filter((id) => id !== rm.dataset.cartRm), start: null }); refreshCart(); }
  if (e.target.closest("[data-cart-empty]")) { Booking.set({ serviceIds: [], extras: {}, start: null }); refreshCart(); }
  const so = e.target.closest("[data-shop-open]");
  if (so && !so.closest("#steps")) openShop();   // en la reserva lo abre su propio manejador
  const cq = e.target.closest("[data-cx]");
  if (cq) { addExtra(cq.dataset.cx, +cq.dataset.d); refreshCart(); }
  if (e.target.closest("[data-route-open]")) $("#routeDlg")?.showModal();
  const dlg = $("#routeDlg");
  if (dlg?.open && (e.target.closest("[data-route-close]") || e.target === dlg || e.target.closest(".route-opt"))) dlg.close();
});

// Foto del servicio: la subida en el panel o, si no hay, una de ambiente según el nombre.
// Una foto distinta por servicio: reales de la barbería en los cortes, de Unsplash en el resto.
const SVC_PHOTO = [
  [/pigment/, F("srv2-pigmentacion")], [/ceja/, F("srv2-cejas")], [/mascarilla/, F("srv2-mascarilla")], [/cepill/, F("srv-cepillado")],
  [/corte y keratina/, REAL("mullet-barba")], [/querat|keratin/, F("srv2-keratina")], [/niñ/, REAL("fade-diseno")],
  [/corte y barba/, REAL("mohicano-barba")], [/barba/, F("srv-barba")], [/tijera/, REAL("pompadour")],
  [/secado|planchado/, REAL("clasico-linea")], [/cerquillo/, REAL("cerquillo")]
];
export function svcPhoto(s) {
  if (safeUrl(s.image_url)) return s.image_url;
  const t = s.name.toLowerCase();
  return (SVC_PHOTO.find(([re]) => re.test(t)) || [, REAL("low-fade")])[1];
}

function menuItem(s, k = 0, cat = "") {
  return `<li class="rv" style="--i:${k % 4}" data-cat="${s.category_id || ""}"><div class="cat-card">
    <a class="cat-card__img" href="#/servicio/${s.id}" tabindex="-1" aria-hidden="true"><img src="${esc(svcPhoto(s))}" alt="" loading="lazy">${cat ? `<span class="cat-card__tag">${esc(cat)}</span>` : ""}<span class="cat-card__dur">${durLabel(s.duration_min)}</span></a>
    <div class="cat-card__body">
      <h4><a href="#/servicio/${s.id}">${esc(s.name)}</a></h4>
      ${s.description ? `<p>${esc(s.description)}</p>` : ""}
      <div class="cat-card__foot"><span class="cat-card__price${s.price == null ? " is-pending" : ""}">${priceLabel(s.price)}</span>
        <span class="cat-card__acts"><button type="button" class="cart-add" data-cart-svc="${s.id}" aria-label="Agregar ${esc(s.name)} al carrito">+ Agregar</button><a class="cat-card__go" href="#/reservar?servicio=${s.id}">Reservar</a></span></div>
    </div></div></li>`;
}

/* Página de un servicio, estilo tienda: foto grande, precio, descripción y botones. Solo datos reales del panel. */
export function viewService(id) {
  const s = activeServices().find((x) => x.id === id);
  if (!s) return `<section class="wrap narrow">${emptyState("Este servicio no está disponible.", "", `<a class="btn" href="#/inicio/servicios">Ver servicios</a>`)}</section>`;
  const cat = State.categories.find((c) => c.id === s.category_id)?.name;
  const inCart = cartSvcs().some((x) => x.id === s.id);
  const others = activeServices().filter((x) => x.id !== s.id && (!s.category_id || x.category_id === s.category_id)).slice(0, 4);
  const wa = waLink();
  return `<section class="wrap pdp">
    <nav class="pdp__crumbs" aria-label="Ruta"><a href="#/">Inicio</a> / <a href="#/inicio/servicios">Servicios</a>${cat ? ` / <span>${esc(cat)}</span>` : ""}</nav>
    <div class="pdp__grid">
      <figure class="pdp__img"><img src="${esc(svcPhoto(s))}" alt="${esc(s.name)}"></figure>
      <div class="pdp__info">
        ${cat ? `<p class="label">${esc(cat)}</p>` : ""}
        <h1>${esc(s.name)}</h1>
        <p class="pdp__price${s.price == null ? " is-pending" : ""}">${priceLabel(s.price)}</p>
        <p class="muted small">Duración ${durLabel(s.duration_min)} · Precios en COP · Se paga en la barbería</p>
        ${s.description ? `<p class="pdp__desc">${esc(s.description)}</p>` : ""}
        <div class="pdp__acts">
          <button type="button" class="btn btn--lg btn--block" data-cart-svc="${s.id}">${inCart ? "✓ Ya está en tu carrito" : "Agregar al carrito"}</button>
          <a class="btn btn--lg btn--block btn--ghost" href="#/reservar?servicio=${s.id}">Reservar ahora</a>
          ${wa ? `<a class="btn btn--block btn--ghost" href="${esc(wa)}" target="_blank" rel="noopener">Preguntar por WhatsApp</a>` : ""}
        </div>
        <details class="pdp__more" open><summary>Detalles</summary><ul>
          <li>Duración: ${durLabel(s.duration_min)}</li>
          ${cat ? `<li>Categoría: ${esc(cat)}</li>` : ""}
          <li>Eliges tu barbero y tu hora al reservar.</li>
          <li>Puedes cancelar o reprogramar hasta ${Number(R().cancelacion_min_horas ?? 2)} h antes desde tu cuenta.</li>
          ${N().direccion ? `<li>Lugar: ${esc(N().direccion)}</li>` : ""}
        </ul></details>
      </div>
    </div>
    ${others.length ? `<h2 class="pdp__rel">También te puede interesar</h2><ul class="catalog">${others.map((x, k) => menuItem(x, k, State.categories.find((c) => c.id === x.category_id)?.name)).join("")}</ul>` : ""}
  </section>`;
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
    if (slot) { selected = slot.dataset.slot; render(); onPick({ start: slot.dataset.slot, barberId: barberId ? slot.dataset.slotBarber : null, slotBarber: slot.dataset.slotBarber }); }
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
  if (query.servicio) addService(query.servicio);
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
const thumb = (url, name, cls) => `<span class="${cls}">${safeUrl(url) || /^assets\//.test(url || "") ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc(initials(name))}</span>`}</span>`;

export function mountBooking() {
  const steps = $("#steps"), summary = $("#summary"), progress = $("#progress"), bar = $("#bookBar");
  const anyEnabled = R().cualquier_barbero !== false;
  let open = null;   // paso abierto a mano con "Cambiar"; null = el primero pendiente

  function validState() {
    const b = Booking.get();
    if ((b.serviceIds || []).length !== cartSvcs(b).length) Booking.set({ serviceIds: cartSvcs(b).map((s) => s.id), start: null });
    if (b.barberId && b.barberId !== "any" && !activeBarbers().some((x) => x.id === b.barberId)) Booking.set({ barberId: null, start: null });
    if (b.barberId === "any" && !anyEnabled) Booking.set({ barberId: null, start: null });
    if (b.start && new Date(b.start) < new Date()) Booking.set({ start: null });
    return Booking.get();
  }

  function render() {
    const b = validState();
    const svcs = cartSvcs(b), svc = svcs[0];
    const svcName = svcs.map((s) => s.name).join(" + "), svcMin = Math.max(0, ...svcs.map((s) => s.duration_min));   // toda la visita, no por servicio
    const total = svcs.reduce((t, s) => t + Number(s.price || 0), 0) + extrasSum(b.extras);
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
    const values = [svcName, barberLabel, b.start ? `${cap(fmtDay(ymd(new Date(b.start)), { weekday: "short", day: "numeric", month: "short" }))} · ${fmtTime(b.start)}` : ""];

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
        <button type="button" class="svc-card${svcs.includes(s) ? " is-sel" : ""}" data-svc="${s.id}" aria-pressed="${svcs.includes(s)}">
          ${thumb(svcPhoto(s), s.name, "svc-card__img")}
          <span class="svc-card__body"><strong>${esc(s.name)}</strong>${s.description ? `<small>${esc(s.description)}</small>` : ""}
            <span class="svc-card__meta"><span>${durLabel(s.duration_min)}</span><span class="${s.price == null ? "is-pending" : ""}">${priceLabel(s.price)}</span></span></span>
        </button>`).join("")}</div>
        <p class="muted small" style="margin-top:12px">Puedes elegir hasta ${MAX_SVC()} servicios; se hacen uno tras otro con el mismo barbero.</p>
        ${svc ? `<button type="button" class="btn" data-next>Continuar${svcs.length > 1 ? ` con ${svcs.length} servicios` : ""}</button>` : ""}`) +
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
      ${svc ? `<img class="ticket__img" src="${esc(svcPhoto(svc))}" alt="">` : ""}
      <p class="label">Tu reserva</p>
      <h2>${svc ? esc(svcName) : "Elige un servicio"}</h2>
      <dl class="sum">
        <div><dt>Barbero</dt><dd>${barberLabel ? esc(barberLabel) : "—"}</dd></div>
        <div><dt>Fecha</dt><dd>${b.start ? esc(cap(fmtDate(b.start))) : "—"}</dd></div>
        <div><dt>Hora</dt><dd>${b.start ? fmtTime(b.start) : "—"}</dd></div>
        <div><dt>Duración</dt><dd>${svc ? durLabel(svcMin) : "—"}</dd></div>
        ${extrasSum(b.extras) ? `<div><dt>Adicionales</dt><dd>${money(extrasSum(b.extras))}</dd></div>` : ""}
        <div class="sum__total"><dt>Total</dt><dd>${svc ? (svcs.some((s) => s.price == null) ? priceLabel(null) : money(total)) : "—"}</dd></div>
      </dl>
      <p class="ticket__note">Pagas en la barbería. Puedes cancelar o reprogramar hasta ${Number(R().cancelacion_min_horas ?? 2)} h antes desde tu cuenta.</p>
      ${N().direccion ? `<p class="ticket__note">${esc(N().direccion)}</p>` : ""}</div>`;

    bar.hidden = !svc;
    bar.innerHTML = svc ? `<div><strong>${esc(svcName)}</strong><small>${esc([barberLabel, values[2]].filter(Boolean).join(" · ") || durLabel(svcMin))}</small></div>
      <span class="book-bar__step">Paso ${cur} de 4</span>` : "";

    if (cur === 3) mountSlotPicker($("#picker"), {
      serviceId: svcs.find((s) => s.duration_min === svcMin).id, barberId: b.barberId === "any" ? null : b.barberId,
      date: b.start ? ymd(new Date(b.start)) : null, selected: b.start,
      onPick: ({ start }) => { Booking.set({ start }); go(null); }
    });
  }

  // Re-dibuja y lleva la vista al paso abierto (útil sobre todo en celular).
  function go(n) { open = n; render(); $(".step.is-open")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  function confirmBlock(b) {
    const p = State.profile || {}, guest = !State.user;
    return `<form id="confirmForm" class="form" novalidate>
      ${guest ? `<p class="muted small">¿Tienes cuenta? <a href="#/cuenta?volver=reservar">Inicia sesión</a> o <a href="#/cuenta/registro?volver=reservar">créala</a> para ver y cambiar tus citas. También puedes reservar como invitado:</p>` : ""}
      <p class="muted small">Tus datos de contacto: el barbero los verá en su agenda por si necesita escribirte.</p>
      <div class="grid-2"><label class="field"><span>Nombre completo</span><input name="full_name" required minlength="2" maxlength="120" autocomplete="name" value="${esc(p.full_name || "")}"></label>
        <label class="field"><span>Celular / WhatsApp</span><input name="phone" type="tel" required minlength="7" maxlength="30" autocomplete="tel" inputmode="tel" value="${esc(p.phone || "")}"></label></div>
      ${guest ? `<label class="field"><span>Correo</span><input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="Te enviamos la confirmación y el recordatorio"></label>` : ""}
      <label class="field"><span>Nota para el barbero (opcional)</span>
        <textarea name="notes" maxlength="500" rows="2" placeholder="Ej.: quiero mantener el largo arriba">${esc(b.notes || "")}</textarea></label>
      ${extrasPromo(b.extras || {})}
      <fieldset class="pay"><legend>¿Cómo vas a pagar?</legend>
        <div class="pay__opts">${PAY.map(([v, ic]) => `<label class="pay__opt"><input type="radio" name="pay" value="${v}" ${b.pay === v ? "checked" : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${v}</span></label>`).join("")}</div>
        <small class="muted">Pagas en la barbería al terminar tu servicio.</small></fieldset>
      <p class="muted small">${guest ? "Reservas como invitado." : `Cuenta: <strong>${esc(State.user.email)}</strong>.`} El pago se hace en la barbería.</p>
      ${consentChecks()}
      <button class="btn btn--lg btn--block" type="submit" data-busy="Confirmando…">Confirmar cita</button>
      <p class="form-msg" id="confirmMsg" role="alert"></p></form>`;
  }

  steps.addEventListener("click", (e) => {
    if (e.target.closest("[data-shop-open]")) return openShop(() => {   // se actualiza en el sitio para no borrar lo que ya se escribió
      const b = Booking.get();
      $("#exPromo").outerHTML = extrasPromo(b.extras || {});
      const tot = $(".sum__total dd", summary);   // solo el total: re-dibujar borraría lo escrito en el formulario
      if (tot && !cartSvcs(b).some((s) => s.price == null)) tot.textContent = money(cartSvcs(b).reduce((t, s) => t + Number(s.price), 0) + extrasSum(b.extras));
    });
    const o = e.target.closest("[data-open]");
    if (o) return go(+o.dataset.open);
    if (e.target.closest("[data-next]")) return go(null);
    const s = e.target.closest("[data-svc]");
    if (s) {
      const ids = cartSvcs().map((x) => x.id), id = s.dataset.svc;
      if (ids.includes(id)) Booking.set({ serviceIds: ids.filter((x) => x !== id), start: null });
      else if (!addService(id)) return;
      refreshCart(); return go(1);
    }
    const bb = e.target.closest("[data-barber]");
    if (bb) { Booking.set({ barberId: bb.dataset.barber, start: null }); return go(null); }
  });
  steps.addEventListener("input", (e) => { if (e.target.name === "notes") Booking.set({ notes: e.target.value }); if (e.target.name === "pay") Booking.set({ pay: e.target.value }); });
  steps.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = Booking.get(), f = formData(e.target);
    if (f.full_name.trim().length < 2) return setMsg($("#confirmMsg"), "Escribe tu nombre completo.");
    if (f.phone.replace(/\D/g, "").length < 7) return setMsg($("#confirmMsg"), "Escribe un celular válido para contactarte.");
    if (!State.user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setMsg($("#confirmMsg"), friendly({ message: "CORREO_INVALIDO" }));
    if (!f.pay) return setMsg($("#confirmMsg"), "Elige cómo vas a pagar.");
    if (consentMissing(f)) return setMsg($("#confirmMsg"), consentMissing(f));
    const ids = cartSvcs(b).map((s) => s.id);
    const extras = SHOP_ITEMS.filter(([n]) => b.extras?.[n]).map(([n, p]) => ({ n, q: b.extras[n], p }));
    const args = { p_services: ids, p_barber: b.barberId !== "any" ? b.barberId : null,
      p_start: b.start, p_notes: b.notes || null, p_extras: extras.length ? extras : null, p_payment: f.pay };
    // La ventana de WhatsApp se abre aquí, durante el clic: después de esperar al servidor el navegador la bloquearía.
    const win = waLink() ? window.open("", "_blank") : null;
    let booked = false;
    await busy(e.submitter || $("#confirmForm button"), async () => {
      if (!State.user) {   // invitado: sin cuenta, con correo para la confirmación y el recordatorio
        try { await logConsent("reserva", f.email.trim(), f.full_name.trim()); } catch (ce) { return setMsg($("#confirmMsg"), friendly(ce)); }
        const { data, error } = await sb.rpc("book_cart_guest", { p_name: f.full_name.trim(), p_phone: f.phone.trim(), p_email: f.email.trim(), ...args });
        if (error) return failed(error);
        sb.functions.invoke("notificaciones").catch(() => {});
        const svcs = cartSvcs(b);
        const row = [{ client_name: f.full_name.trim(), client_phone: f.phone.trim(), services: svcs.map((s) => ({ n: s.name, p: s.price })), price: svcs.every((s) => s.price != null) ? svcs.reduce((t, s) => t + Number(s.price), 0) : null,
          starts_at: data.starts_at, ends_at: data.ends_at, barber_name: data.barber, status: data.status, extras: extras.length ? extras : null, payment_method: f.pay }];
        booked = true; sendToWa(win, row);
        Booking.clear(); refreshCart();
        steps.closest(".book").outerHTML = doneHtml(row, f.email.trim());
        return scrollTo(0, 0);
      }
      const { error: pe } = await sb.from("profiles").update({ full_name: f.full_name.trim(), phone: f.phone.trim() }).eq("id", State.user.id);
      if (pe) return setMsg($("#confirmMsg"), friendly(pe));
      try { await logConsent("reserva", State.user.email, f.full_name.trim()); } catch (ce) { return setMsg($("#confirmMsg"), friendly(ce)); }
      await loadProfile();
      const { data, error } = await sb.rpc("book_cart", args);
      if (error) return failed(error);
      sb.functions.invoke("notificaciones").catch(() => {});   // correo de confirmación ya; si falla, lo manda la tarea programada
      const { data: row } = await sb.from("appointments").select("*").eq("id", data[0]).single();
      booked = true; if (row) sendToWa(win, [row]); else win?.close();
      Booking.clear();
      location.hash = `#/reserva/${data.join(",")}`;
    });
    if (!booked) win?.close();
  });
  function failed(error) {
    setMsg($("#confirmMsg"), friendly(error));
    if (/HORARIO_OCUPADO|ANTICIPACION|BLOQUEADO|FUERA_DE_HORARIO/.test(error.message)) { Booking.set({ start: null }); toast(friendly(error), "err"); go(null); }
  }
  render();
}

const PAY = [["Efectivo", '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'], ["Nequi", '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'],
  ["Transferencia", '<path d="M4 8h15l-4-4M20 16H5l4 4"/>'], ["Tarjeta", '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>']];
const svcLines = (a) => a.services?.length ? a.services : [{ n: a.service_name, p: a.price }];

const waDigits = () => { const d = String(N().telefono || "").replace(/\D/g, ""); return d.length === 10 ? "57" + d : d; };
function waMessage(list) {
  const a = list[0], total = list.every((x) => x.price != null) ? list.reduce((t, x) => t + Number(x.price), 0) + extrasTotal(a.extras) : null;
  return ["Hola, acabo de reservar en la web:", `Nombre: ${a.client_name}`, a.client_phone && `Celular: ${a.client_phone}`,
    `Fecha: ${cap(fmtDate(a.starts_at))}`, `Hora: ${fmtTime(a.starts_at)} – ${fmtTime(list.at(-1).ends_at)}`, `Servicios: ${list.flatMap(svcLines).map((x) => x.n).join(", ")}`,
    `Barbero: ${a.barber_name}`, a.extras?.length && `Adicionales: ${extrasText(a.extras)}`, a.payment_method && `Pago: ${a.payment_method}`, total != null && `Total: ${money(total)}`].filter(Boolean).join("\n");
}
// WhatsApp solo deja el mensaje escrito con un número; los enlaces wa.me/message no aceptan texto, y entonces se copia para pegarlo.
const waBookingUrl = (list) => waDigits() ? `https://wa.me/${waDigits()}?text=${encodeURIComponent(waMessage(list))}` : waLink();
function sendToWa(win, list) {
  if (!waDigits()) navigator.clipboard?.writeText(waMessage(list)).catch(() => {});
  if (win) win.location.href = waBookingUrl(list);
}
document.addEventListener("click", (e) => { const c = e.target.closest("[data-wa-copy]"); if (c) navigator.clipboard?.writeText(c.dataset.waCopy).catch(() => {}); });

/* Confirmación visual después de reservar (lee la cita real desde Supabase). */
export async function viewBooked(id) {
  const { data: list, error } = await sb.from("appointments").select("*").in("id", id.split(",").slice(0, 10)).order("starts_at");
  const a = list?.[0], last = list?.at(-1);
  if (error || !a) return `<section class="wrap narrow">${emptyState("No encontramos esa reserva.", "", `<a class="btn" href="#/cuenta">Ver mis citas</a>`)}</section>`;
  return doneHtml(list);
}
// guestEmail: reserva de invitado (no puede leer sus citas; se muestra lo que devolvió la reserva).
function doneHtml(list, guestEmail) {
  const a = list[0], last = list.at(-1), wa = waBookingUrl(list), lines = list.flatMap(svcLines);
  const pend = a.status === "pendiente";
  return `<section class="wrap done">
    <div class="done__head"><p class="label">${pend ? "Reserva recibida" : "Cita confirmada"}</p>
      <h1>${pend ? "Tu cita está pendiente de confirmación" : "Te esperamos"}</h1></div>
    <div class="done__ticket">
      <div class="done__date"><span>${esc(cap(fmtDay(ymd(new Date(a.starts_at)), { weekday: "long" })))}</span><strong>${+ymd(new Date(a.starts_at)).slice(8)}</strong><span>${esc(fmtDay(ymd(new Date(a.starts_at)), { month: "long", year: "numeric" }))}</span></div>
      <dl class="sum">
        <div><dt>Hora</dt><dd>${fmtTime(a.starts_at)} – ${fmtTime(last.ends_at)}</dd></div>
        <div><dt>Servicio${lines.length > 1 ? "s" : ""}</dt><dd>${lines.map((x) => `${esc(x.n)} · ${priceLabel(x.p)}`).join("<br>")}</dd></div>
        <div><dt>Barbero</dt><dd>${esc(a.barber_name)}</dd></div>
        ${a.extras?.length ? `<div><dt>Adicionales</dt><dd>${esc(extrasText(a.extras))} · ${money(extrasTotal(a.extras))}</dd></div>` : ""}
        ${list.every((x) => x.price != null) ? `<div class="sum__total"><dt>Total a pagar en la barbería</dt><dd>${money(list.reduce((t, x) => t + Number(x.price), 0) + extrasTotal(a.extras))}</dd></div>` : ""}
        ${a.payment_method ? `<div><dt>Método de pago</dt><dd>${esc(a.payment_method)} · en la barbería</dd></div>` : ""}
        ${N().direccion ? `<div><dt>Lugar</dt><dd>${esc(N().direccion)}</dd></div>` : ""}
      </dl>
    </div>
    ${pend ? `<p class="muted">La barbería confirmará tu cita pronto.${a.pending_expires_at ? ` Si no se confirma antes de ${esc(fmtDateTime2(a.pending_expires_at))}, el horario se libera.` : ""}</p>` : ""}
    ${guestEmail ? `<p class="muted">Te enviamos la confirmación a <strong>${esc(guestEmail)}</strong> y un recordatorio 2 horas antes. Para cambiar o cancelar, escríbenos${wa ? " por WhatsApp" : ""}.</p>` : ""}
    ${wa ? `<p class="muted">${waDigits() ? "Abrimos WhatsApp con tu reserva escrita: solo toca enviar. Si no se abrió, usa este botón." : "Abrimos WhatsApp y copiamos tu reserva: pégala en el chat y envíala. Si no se abrió, usa este botón."}</p>` : ""}
    <div class="row">${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener" ${waDigits() ? "" : `data-wa-copy="${esc(waMessage(list))}"`}>Enviar mi reserva por WhatsApp</a>` : ""}${guestEmail ? "" : `<a class="btn btn--ghost" href="#/cuenta">Ver mis citas</a>`}<a class="btn btn--ghost" href="#/">Volver al inicio</a></div>
  </section>`;
}
const fmtDateTime2 = (d) => d ? `${fmtDate(d)} ${fmtTime(d)}` : "";
