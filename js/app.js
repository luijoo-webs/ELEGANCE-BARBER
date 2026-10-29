/* Arranque y enrutador (#/ruta). Las rutas privadas se validan aquí y, sobre todo, en RLS. */
import { CONFIGURED, sb, State, $, esc, safeUrl, loader, emptyState, friendly, loadPublic, loadProfile, isAdmin, waLink } from "./core.js";
import { viewHome, viewBooking, mountBooking, viewBooked } from "./public.js";
import { viewAccount, processAuthLink, Recovery } from "./account.js";

const app = $("#app");
let seq = 0;

function parse() {
  const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, query: Object.fromEntries(new URLSearchParams(qs)) };
}

const igHandle = (u) => (String(u || "").match(/instagram\.com\/([^/?#]+)/i) || [])[1] || "";
const brandMark = () => esc(safeUrl(State.settings.negocio?.logo_url) || "assets/logo-mark.jpg");

function header() {
  const n = State.settings.negocio || {};
  const ig = igHandle(n.instagram);
  const links = [["Precios", "servicios"], ["Barberos", "barberos"],
    ...(State.gallery.some((g) => g.active) || safeUrl(n.instagram) ? [["Trabajos", "galeria"]] : []),
    ["Nosotros", "nosotros"], ["Horario", "horario"], ["Contacto", "visitanos"]];
  // El panel admin no se enlaza aquí: se entra directo por #/admin.
  return `<a class="skip" href="#main">Saltar al contenido</a>
  <header class="top">
    <div class="top__inner wrap">
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="drawer" aria-label="Abrir menú"><span class="menu-btn__i" aria-hidden="true"><i></i><i></i></span><span class="menu-btn__t">Menú</span></button>
      <a class="brand" href="#/" aria-label="${esc(n.nombre || "Elegance Barber")} — inicio">
        <img src="${brandMark()}" alt="" class="brand__logo" width="40" height="40">
        <span class="brand__word">Elegance<small>Barber</small></span></a>
      <div class="top__actions"><a class="top__acc" href="#/cuenta">${State.user ? "Mi cuenta" : "Ingresar"}</a><a class="btn btn--sm top__cta" href="#/reservar">Reservar</a></div>
    </div>
  </header>
  <div class="drawer" id="drawer" hidden>
    <div class="drawer__scrim" data-drawer-close></div>
    <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Menú principal">
      <div class="drawer__head"><span>Menú</span><button type="button" class="drawer__x" data-drawer-close aria-label="Cerrar menú">×</button></div>
      <nav class="drawer__nav" aria-label="Principal">${links.map(([t, id], i) => `<a href="#/inicio/${id}"><span>${String(i + 1).padStart(2, "0")}</span>${t}</a>`).join("")}</nav>
      <div class="drawer__foot">
        <a class="btn btn--block" href="#/reservar">Reservar cita</a>
        <a class="link-line" href="#/cuenta">${State.user ? "Mi cuenta" : "Ingresar o crear cuenta"}</a>
        ${n.direccion ? `<p>${esc(n.direccion)}${n.ciudad ? `, ${esc(n.ciudad)}` : ""}</p>` : ""}
        <p>${ig ? `<a href="${esc(n.instagram)}" target="_blank" rel="noopener">@${esc(ig)}</a>` : ""}${waLink() ? `${ig ? " · " : ""}<a href="${esc(waLink())}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</p>
      </div>
    </aside>
  </div>`;
}

function footer() {
  const n = State.settings.negocio || {};
  const links = [["Instagram", n.instagram], ["Facebook", n.facebook], ["TikTok", n.tiktok], ["WhatsApp", waLink()]].filter(([, u]) => safeUrl(u));
  return `<footer class="foot"><div class="wrap foot__inner">
    <a class="foot__logo" href="#/" aria-label="Inicio"><img src="assets/logo.jpg" alt="The Elegance Of The Barber's" loading="lazy" width="120" height="120"></a>
    <div><h4>Visítanos</h4><p>${esc(n.direccion || "Dirección por confirmar")}${n.ciudad ? `<br>${esc(n.ciudad)}` : ""}</p></div>
    <div><h4>Síguenos</h4><ul>${links.map(([k, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${k}</a></li>`).join("")}</ul></div>
    <div><h4>Tu cita</h4><ul><li><a href="#/reservar">Reservar</a></li><li><a href="#/cuenta">Mi cuenta</a></li></ul></div>
    <p class="foot__copy">© ${new Date().getFullYear()} ${esc(n.nombre_largo || n.nombre || "Elegance Barber")}${n.eslogan ? ` · ${esc(n.eslogan)}` : ""}</p>
  </div></footer>
  <a class="fab" href="#/reservar">Reservar cita</a>`;
}

async function render() {
  const my = ++seq;
  const { parts, query } = parse();
  const [route = "", a, b] = parts;
  let html = "", mount = null;
  document.body.dataset.route = route || "inicio";
  const panel = route === "admin" && isAdmin();
  document.body.classList.toggle("is-admin", panel);
  try {
    if (route === "admin") {
      if (!State.user) { location.hash = "#/cuenta?volver=admin"; return; }
      if (!isAdmin()) html = `<section class="wrap narrow">${emptyState("No tienes permisos de administrador.", "Esta sección es solo para el equipo de la barbería.", `<a class="btn" href="#/">Ir al inicio</a>`)}</section>`;
      else { app.innerHTML = loader("Cargando panel…"); const Admin = await import("./admin.js"); if (my !== seq) return; ({ html, mount } = await Admin.view(a || "resumen", b, query)); }
    } else if (route === "" || route === "inicio") html = viewHome();
    else if (route === "reservar") { html = viewBooking(query); mount = mountBooking; }
    else if (route === "reserva" && a) { app.innerHTML = header() + loader(); html = State.user ? await viewBooked(a) : ""; if (!State.user) { location.hash = "#/cuenta"; return; } }
    else if (route === "cuenta") {
      if (query.volver === "admin" && State.user) { location.hash = "#/admin"; return; }
      ({ html, mount } = await viewAccount(a, query, b));
    }
    else html = `<section class="wrap narrow">${emptyState("Página no encontrada.", "", `<a class="btn" href="#/">Ir al inicio</a>`)}</section>`;
  } catch (e) {
    console.error(e);
    html = `<section class="wrap narrow">${emptyState("No pudimos cargar esta página.", friendly(e), `<button class="btn" onclick="location.reload()">Reintentar</button>`)}</section>`;
  }
  if (my !== seq) return;
  app.innerHTML = (panel ? "" : header()) + `<main id="main" tabindex="-1">${html}</main>` + (panel ? "" : footer());
  mount?.();
  bindHeader();
  bindMotion();
  if (route === "inicio" && a) document.getElementById(a)?.scrollIntoView({ behavior: "smooth" });
  else window.scrollTo(0, 0);
}

function bindHeader() {
  const btn = $(".menu-btn"), drawer = $("#drawer");
  document.body.classList.remove("no-scroll");
  if (!btn || !drawer) return;
  const onKey = (e) => { if (e.key === "Escape") toggle(false); };
  function toggle(open) {
    btn.setAttribute("aria-expanded", open);
    drawer.hidden = !open;
    document.body.classList.toggle("no-scroll", open);
    if (open) { document.addEventListener("keydown", onKey); $(".drawer__nav a", drawer)?.focus(); }
    else { document.removeEventListener("keydown", onKey); btn.focus(); }
  }
  btn.addEventListener("click", () => toggle(true));
  drawer.addEventListener("click", (e) => { if (e.target.closest("[data-drawer-close], a")) toggle(false); });
}

// Aparición al hacer scroll (.rv / .rv-img) y parallax suave de [data-parallax].
const still = matchMedia("(prefers-reduced-motion: reduce)");
let io, parallax = [];
function bindMotion() {
  io?.disconnect();
  const els = [...app.querySelectorAll(".rv, .rv-img")];
  if (still.matches || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-in")); parallax = []; return; }
  io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach((el) => io.observe(el));
  parallax = [...app.querySelectorAll("[data-parallax]")];
  onScroll();
}
function onScroll() {
  const vh = innerHeight;
  for (const el of parallax) {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    el.style.transform = `translate3d(0, ${((r.top + r.height / 2 - vh / 2) * -0.15).toFixed(1)}px, 0)`;
  }
}
addEventListener("scroll", () => parallax.length && requestAnimationFrame(onScroll), { passive: true });

function setupScreen(detail = "") {
  app.innerHTML = `<main class="wrap narrow setup"><p class="eyebrow">Configuración pendiente</p><h1>Falta conectar Supabase</h1>
    <p>${detail ? esc(detail) : "La web todavía no tiene credenciales de Supabase."} Sigue <code>LEEME.md</code>:</p>
    <ol><li>Crea el proyecto en Supabase y ejecuta <code>supabase/01_esquema.sql</code> y <code>supabase/02_storage.sql</code>.</li>
    <li>Pega la Project URL y la clave pública (anon) en <code>js/config.js</code>.</li><li>Recarga esta página.</li></ol></main>`;
}

async function start() {
  if (!CONFIGURED) return setupScreen();
  app.innerHTML = loader("Cargando…");
  await processAuthLink();
  try { await Promise.all([loadPublic(), loadProfile()]); }
  catch (e) {
    console.error(e);
    return setupScreen(/relation|does not exist|schema cache/i.test(e.message || "") ? "La base de datos aún no tiene las tablas: falta ejecutar los scripts SQL." : friendly(e));
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") { Recovery.start(); location.hash = "#/cuenta/nueva-clave"; }
    if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) setTimeout(async () => { await loadProfile(); if (event !== "SIGNED_IN") render(); }, 0);
  });
  window.addEventListener("hashchange", render);
  render();
}
start();
