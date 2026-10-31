/* Núcleo compartido: conexión, estado, utilidades de fecha (America/Bogota), errores y UI básica. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=20261031a";

export const CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const sb = CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
export const SITE_URL = location.origin + location.pathname.replace(/index\.html$/, "");

/* ---------- Estado global ---------- */
export const State = {
  user: null, profile: null,
  settings: { negocio: {}, reservas: {} },
  categories: [], services: [], barbers: [], schedules: [], gallery: [],
  loaded: false, error: null
};

export async function loadPublic() {
  const [st, cat, svc, bar, sch, gal] = await Promise.all([
    sb.from("settings").select("key,value"),
    sb.from("service_categories").select("*").order("sort_order").order("name"),
    sb.from("services").select("*").is("deleted_at", null).order("sort_order").order("name"),
    sb.from("barbers").select("*").is("deleted_at", null).order("sort_order").order("name"),
    sb.from("schedules").select("*").order("weekday").order("start_time"),
    sb.from("gallery").select("*").order("sort_order")
  ]);
  const err = [st, cat, svc, bar, sch, gal].find((r) => r.error)?.error;
  if (err) throw err;
  State.settings = { negocio: {}, reservas: {}, ...Object.fromEntries(st.data.map((r) => [r.key, r.value])) };
  State.categories = cat.data; State.services = svc.data; State.barbers = bar.data;
  State.schedules = sch.data; State.gallery = gal.data;
  State.loaded = true;
  applyBrand();
}

export async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  State.user = session?.user || null;
  State.profile = null;
  if (State.user) {
    const { data } = await sb.from("profiles").select("*").eq("id", State.user.id).maybeSingle();
    State.profile = data;
  }
}
export const isAdmin = () => State.profile?.role === "admin";

export function applyBrand() {
  const n = State.settings.negocio || {};
  if (/^#[0-9a-f]{6}$/i.test(n.color_acento || "")) document.documentElement.style.setProperty("--accent", n.color_acento);
  document.title = `${n.nombre || "Elegance Barber"} — Barbería`;
}

/* ---------- Utilidades ---------- */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = (u) => (/^(https?:|mailto:|tel:)/i.test(String(u || "").trim()) ? String(u).trim() : "");

export const money = (v) => v == null || v === "" ? null
  : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v));
export const priceLabel = (v) => money(v) ?? "Precio por confirmar";
export const durLabel = (m) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;

/* ---------- Fechas en America/Bogota ----------
   Colombia no tiene horario de verano: el desfase es siempre -05:00. */
export const TZ = "America/Bogota";
const OFFSET = "-05:00";
export const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const ymd = (d = new Date()) => ymdFmt.format(d);                       // fecha local "YYYY-MM-DD"
export const todayYmd = () => ymd(new Date());
export const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = (s) => new Date(`${s}T12:00:00Z`).getUTCDay();
export const mondayOf = (s) => addDays(s, -((weekday(s) + 6) % 7));
export const toIso = (dateStr, hhmm) => new Date(`${dateStr}T${hhmm}:00${OFFSET}`).toISOString();
export const hhmm = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
export const fmtTime = (d) => new Date(d).toLocaleTimeString("es-CO", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtDate = (d, o = {}) => new Date(d).toLocaleDateString("es-CO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...o });
export const fmtDay = (s, o = {}) => new Date(`${s}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", ...o });
export const fmtDateTime = (d) => `${fmtDate(d, { year: "numeric" })} · ${fmtTime(d)}`;
export const minutes = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const shortTime = (t) => String(t).slice(0, 5);

export const STATUS = { pendiente: "Pendiente", confirmada: "Confirmada", cancelada: "Cancelada", completada: "Completada" };
export const statusBadge = (s) => `<span class="badge badge--${esc(s)}">${esc(STATUS[s] || s)}</span>`;

/* ---------- Errores en español ---------- */
const ERRORS = {
  NO_AUTENTICADO: "Inicia sesión para continuar.",
  NO_AUTORIZADO: "No tienes permisos para esta acción.",
  SOLO_CANCELADAS: "Solo se pueden eliminar citas canceladas.",
  CITA_NO_ENCONTRADA: "La cita ya no existe.",
  SERVICIO_NO_DISPONIBLE: "Ese servicio ya no está disponible.",
  ANTICIPACION_MINIMA: "Esa hora ya no cumple la anticipación mínima para reservar. Elige otra.",
  FUERA_DE_RANGO: "Esa fecha está fuera del periodo en el que se aceptan reservas.",
  ELIGE_BARBERO: "Elige un barbero para continuar.",
  LIMITE_RESERVAS: "Ya tienes el máximo de citas activas. Cancela una o espera a que pase para reservar otra.",
  HORARIO_OCUPADO: "Ese horario acaba de ser reservado. Elige otra hora, por favor.",
  HORARIO_BLOQUEADO: "Ese horario está bloqueado (cierre, festivo o ausencia).",
  FUERA_DE_HORARIO: "La hora elegida está fuera del horario de atención de ese barbero.",
  BARBERO_NO_DISPONIBLE: "Ese barbero no está disponible en este momento.",
  CITA_NO_ENCONTRADA: "No encontramos esa cita.",
  CITA_NO_MODIFICABLE: "Esta cita ya no se puede modificar.",
  FUERA_DE_PLAZO: "Ya pasó el plazo para cancelar o reprogramar esta cita en línea. Escríbenos por WhatsApp.",
  REPROGRAMACION_DESACTIVADA: "La reprogramación en línea no está habilitada. Escríbenos por WhatsApp.",
  HORARIO_PASADO: "No se pueden agendar citas en horas que ya pasaron.",
  ESTADO_INVALIDO: "Estado no válido.",
  CLIENTE_REQUERIDO: "Escribe el nombre del cliente o elige uno registrado.",
  TRANSICION_INVALIDA: "Ese cambio de estado no está permitido.",
  CITA_FUTURA: "Solo puedes marcar como completada una cita que ya empezó.",
  RANGO_INVALIDO: "El rango de fechas no es válido (máximo un año)."
};
export function friendly(e) {
  const m = String(e?.message || e || "");
  const code = Object.keys(ERRORS).find((k) => m.includes(k));
  if (code) return ERRORS[code];
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m)) return "Aún no confirmas tu correo. Revisa tu bandeja de entrada (y spam).";
  if (/already registered|already been registered/i.test(m)) return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
  if (/Password should be|weak password/i.test(m)) return "La contraseña es muy débil: usa al menos 8 caracteres con letras y números.";
  if (/rate limit|too many|seconds/i.test(m)) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (/same.*password|different from the old/i.test(m)) return "La nueva contraseña debe ser distinta de la anterior.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  if (/JWT|session/i.test(m)) return "Tu sesión expiró. Inicia sesión de nuevo.";
  if (/row-level security|permission denied/i.test(m)) return "No tienes permisos para esta acción.";
  if (/duplicate key/i.test(m)) return "Ya existe un registro con esos datos.";
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

/* ---------- UI ---------- */
export function toast(msg, type = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const t = document.createElement("div");
  t.className = `toast toast--${type}`; t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}
export const loader = (txt = "Cargando…") => `<div class="loader" role="status"><span class="spin" aria-hidden="true"></span>${esc(txt)}</div>`;
export const emptyState = (title, text = "", action = "") => `<div class="empty"><p class="empty__t">${esc(title)}</p>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
export const formData = (form) => Object.fromEntries(new FormData(form).entries());
export function setMsg(el, text, ok = false) { if (!el) return; el.textContent = text || ""; el.classList.toggle("ok", ok); }
/* Deshabilita el botón mientras corre la acción para evitar envíos dobles. */
export async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.disabled) return;
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${btn.dataset.busy || "Procesando…"}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

/* Modal accesible (Escape y clic fuera cierran; foco al primer campo). */
export function modal(html, { wide = false, onClose } = {}) {
  const prev = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = "modal"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="modal__box${wide ? " modal__box--wide" : ""}"><button class="modal__x" type="button" aria-label="Cerrar">×</button>${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); prev?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest(".modal__x") || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(wrap);
  ($("input,select,textarea,button:not(.modal__x)", wrap) || $(".modal__x", wrap)).focus();
  return { el: wrap, close };
}
export function confirmDialog(text, okLabel = "Confirmar", danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2 class="modal__t">${esc(text)}</h2><div class="row-end"><button class="btn btn--ghost" data-close type="button">Volver</button><button class="btn ${danger ? "btn--danger" : ""}" data-ok type="button">${esc(okLabel)}</button></div>`,
      { onClose: () => { if (!done) resolve(false); } });
    $("[data-ok]", m.el).addEventListener("click", () => { done = true; m.close(); resolve(true); });
  });
}

/* Sube una imagen al bucket "media" (solo admin, lo exige Storage RLS). Devuelve la URL pública. */
export async function uploadImage(file, folder) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Formato no permitido: usa JPG, PNG o WEBP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera 5 MB. Redúcela antes de subirla.");
  const blob = await shrink(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
}
/* Redimensiona a máx. 1800 px y comprime (WEBP si el navegador lo soporta). */
async function shrink(file, max = 1800) {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, "image/webp", 0.82));
    return out && out.type === "image/webp" ? out : await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  } catch { return file; }
}

/* Horario semanal en texto: agrupa franjas por día. barberId null = negocio. */
export function scheduleByDay(barberId = null) {
  const rows = State.schedules.filter((s) => (s.barber_id || null) === barberId);
  const map = Array.from({ length: 7 }, () => []);
  rows.forEach((r) => map[r.weekday].push(`${shortTime(r.start_time)}–${shortTime(r.end_time)}`));
  return map;
}
export function barberWorkDays(id) {
  const own = State.schedules.filter((s) => s.barber_id === id);
  const src = own.length ? own : State.schedules.filter((s) => !s.barber_id);
  const days = [...new Set(src.map((s) => s.weekday))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return days.map((d) => DAYS_SHORT[d]);
}

export const waLink = () => {
  const n = State.settings.negocio || {}, d = String(n.telefono || "").replace(/\D/g, "");
  return safeUrl(n.whatsapp_url) || (d ? `https://wa.me/${d.length === 10 ? "57" + d : d}` : "");   // celular colombiano sin indicativo
};

/* ---------- Legal: cookies opcionales y consentimiento trazable ---------- */
// Solo el mapa de Google pone cookies de terceros; la sesión usa almacenamiento local estrictamente necesario.
export const cookieChoice = () => { try { return localStorage.getItem("eb_cookies"); } catch { return null; } };
export const setCookieChoice = (v) => { try { localStorage.setItem("eb_cookies", v); } catch { /* modo privado */ } };
export const mapAllowed = () => cookieChoice() === "all";

export const LEGAL_VERSION = "2026-10-30";   // cámbiala cuando edites términos o privacidad
export const consentChecks = () => `<div class="consent">
  <label class="check"><input type="checkbox" name="acepta_terminos" required> <span>Acepto los <a href="#/legal/terminos" target="_blank" rel="noopener">términos y condiciones</a> y la <a href="#/legal/reembolsos" target="_blank" rel="noopener">política de cancelación y reembolso</a>.</span></label>
  <label class="check"><input type="checkbox" name="acepta_privacidad" required> <span>Autorizo el tratamiento de mis datos según la <a href="#/legal/privacidad" target="_blank" rel="noopener">política de privacidad</a>.</span></label>
</div>`;
export const consentMissing = (f) => (!f.acepta_terminos ? "Debes aceptar los términos y condiciones." : !f.acepta_privacidad ? "Debes autorizar el tratamiento de tus datos (política de privacidad)." : "");
// Guarda en Supabase quién aceptó, qué versión, cuándo, desde qué formulario, navegador e IP (la IP la toma el servidor).
export async function logConsent(form, email, name) {
  const { error } = await sb.rpc("log_consent", { p_documents: ["terminos", "privacidad"], p_version: LEGAL_VERSION, p_form: form,
    p_email: email || null, p_full_name: name || null, p_page_url: location.href.slice(0, 500), p_user_agent: navigator.userAgent.slice(0, 500) });
  if (error) throw error;
}
