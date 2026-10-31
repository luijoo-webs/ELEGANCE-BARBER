/* Cuentas de cliente: registro, sesión, recuperación, perfil y mis citas. */
import {
  sb, State, SITE_URL, $, esc, friendly, toast, loader, emptyState, busy, setMsg, formData, confirmDialog, modal,
  fmtDate, fmtTime, durLabel, priceLabel, statusBadge, ymd, loadProfile, waLink, consentChecks, consentMissing, logConsent
} from "./core.js";
import { mountSlotPicker } from "./public.js";

const back = (q) => (q.volver === "reservar" ? "#/reservar" : "#/cuenta");
const R = () => State.settings.reservas || {};

/* ---------- Enlaces de correo (confirmación y recuperación) ----------
   Las plantillas envían <sitio>/?token_hash=…&type=signup|recovery|email_change
   y se validan con verifyOtp: funciona aunque se abra en otro navegador. */
const RECOVERY_KEY = "eb_recovery_until";
export const Recovery = {
  start() { try { sessionStorage.setItem(RECOVERY_KEY, String(Date.now() + 30 * 60000)); } catch {} },
  active() { try { return Number(sessionStorage.getItem(RECOVERY_KEY) || 0) > Date.now(); } catch { return false; } },
  end() { try { sessionStorage.removeItem(RECOVERY_KEY); } catch {} }
};
const cleanUrl = (hash) => history.replaceState(null, "", location.pathname + hash);
export async function processAuthLink() {
  const q = new URLSearchParams(location.search);
  const err = q.get("error_code") || q.get("error");
  if (err) return cleanUrl(`#/cuenta/enlace-invalido`);
  const tokenHash = q.get("token_hash"), type = q.get("type");
  if (!tokenHash || !type) return;
  if (type === "recovery") await sb.auth.signOut({ scope: "local" }).catch(() => {});
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return cleanUrl(`#/cuenta/enlace-invalido`);
  if (type === "recovery") { Recovery.start(); return cleanUrl("#/cuenta/nueva-clave"); }
  cleanUrl("#/cuenta/confirmada");
}

/* ---------- Vistas de acceso ---------- */
const authShell = (title, lead, body) => `<section class="auth wrap narrow"><p class="eyebrow">Mi cuenta</p><h1>${title}</h1>${lead ? `<p class="muted">${lead}</p>` : ""}${body}</section>`;
const pw = (name, label, auto) => `<label class="field"><span>${label}</span><div class="pw"><input type="password" name="${name}" required minlength="8" autocomplete="${auto}"><button type="button" class="link-btn" data-toggle-pw aria-label="Mostrar contraseña">Ver</button></div></label>`;

function viewLogin(q) {
  return authShell("Iniciar sesión", q.volver === "reservar" ? "Inicia sesión para confirmar tu reserva. Tu selección está guardada." : "", `
    <form class="form" id="loginForm" novalidate>
      <label class="field"><span>Correo electrónico</span><input type="email" name="email" required autocomplete="email"></label>
      ${pw("password", "Contraseña", "current-password")}
      <button class="btn btn--block" type="submit" data-busy="Entrando…">Entrar</button>
      <p class="form-msg" id="authMsg" role="alert"></p>
    </form>
    <p class="auth__alt"><a href="#/cuenta/recuperar">¿Olvidaste tu contraseña?</a></p>
    <p class="auth__alt">¿No tienes cuenta? <a href="#/cuenta/registro${q.volver ? `?volver=${esc(q.volver)}` : ""}">Crea una</a></p>`);
}
function viewRegister(q) {
  return authShell("Crear cuenta", "Con tu cuenta reservas en segundos y consultas tus citas.", `
    <form class="form" id="registerForm" novalidate>
      <label class="field"><span>Nombre completo</span><input name="full_name" required minlength="2" maxlength="120" autocomplete="name"></label>
      <label class="field"><span>Correo electrónico</span><input type="email" name="email" required autocomplete="email"></label>
      <label class="field"><span>Celular / WhatsApp</span><input type="tel" name="phone" required minlength="7" maxlength="30" autocomplete="tel" inputmode="tel"></label>
      ${pw("password", "Contraseña (mín. 8, con letras y números)", "new-password")}
      ${consentChecks()}
      <button class="btn btn--block" type="submit" data-busy="Creando cuenta…">Crear cuenta</button>
      <p class="form-msg" id="authMsg" role="alert"></p>
    </form>
    <p class="auth__alt">¿Ya tienes cuenta? <a href="#/cuenta${q.volver ? `?volver=${esc(q.volver)}` : ""}">Inicia sesión</a></p>`);
}
const viewRecover = () => authShell("Recuperar contraseña", "Te enviaremos un enlace para crear una contraseña nueva.", `
  <form class="form" id="recoverForm" novalidate>
    <label class="field"><span>Correo electrónico</span><input type="email" name="email" required autocomplete="email"></label>
    <button class="btn btn--block" type="submit" data-busy="Enviando…">Enviar enlace</button>
    <p class="form-msg" id="authMsg" role="alert"></p>
  </form><p class="auth__alt"><a href="#/cuenta">Volver a iniciar sesión</a></p>`);
const viewNewPassword = () => authShell("Crea tu nueva contraseña", "", `
  <form class="form" id="newPwForm" novalidate>
    ${pw("password", "Nueva contraseña", "new-password")}
    ${pw("password2", "Repite la contraseña", "new-password")}
    <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar contraseña</button>
    <p class="form-msg" id="authMsg" role="alert"></p>
  </form>`);

const validPw = (p) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function mountAuth(q) {
  $(".auth")?.addEventListener("click", togglePw);
  const msg = (t, ok) => setMsg($("#authMsg"), t, ok);
  $("#loginForm")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (!validEmail(f.email) || !f.password) return msg("Escribe tu correo y contraseña.");
    busy(e.submitter, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      if (error) return msg(friendly(error));
      await loadProfile(); location.hash = back(q);
    });
  });
  $("#registerForm")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (f.full_name.trim().length < 2) return msg("Escribe tu nombre.");
    if (!validEmail(f.email)) return msg("Escribe un correo válido.");
    if (!validPw(f.password)) return msg("La contraseña debe tener al menos 8 caracteres, con letras y números.");
    if (f.phone.replace(/\D/g, "").length < 7) return msg("Escribe un celular válido.");
    if (consentMissing(f)) return msg(consentMissing(f));
    busy(e.submitter, async () => {
      try { await logConsent("registro", f.email.trim(), f.full_name.trim()); } catch (ce) { return msg(friendly(ce)); }
      // El rol NO se envía: el servidor siempre crea cuentas de cliente.
      const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.password,
        options: { emailRedirectTo: SITE_URL, data: { full_name: f.full_name.trim(), phone: f.phone.trim() } } });
      if (error) return msg(friendly(error));
      if (data.session) { await loadProfile(); location.hash = back(q); return; }
      e.target.outerHTML = `<div class="notice"><strong>Revisa tu correo.</strong> Te enviamos un enlace para confirmar tu cuenta a <b>${esc(f.email)}</b>. Después inicia sesión${q.volver === "reservar" ? " y confirma tu reserva: la selección sigue guardada" : ""}.</div>`;
    });
  });
  $("#recoverForm")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (!validEmail(f.email)) return msg("Escribe un correo válido.");
    busy(e.submitter, async () => {
      const { error } = await sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: SITE_URL });
      // Mismo mensaje exista o no la cuenta (no revelamos qué correos están registrados).
      if (error && /rate|seconds/i.test(error.message)) return msg(friendly(error));
      msg("Si el correo tiene una cuenta, te llegará un enlace en unos minutos. Revisa también spam.", true);
    });
  });
  $("#newPwForm")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (!validPw(f.password)) return msg("La contraseña debe tener al menos 8 caracteres, con letras y números.");
    if (f.password !== f.password2) return msg("Las contraseñas no coinciden.");
    busy(e.submitter, async () => {
      const { error } = await sb.auth.updateUser({ password: f.password });
      if (error) return msg(friendly(error));
      Recovery.end(); toast("Contraseña actualizada."); location.hash = "#/cuenta";
    });
  });
}
function togglePw(e) {
  const b = e.target.closest("[data-toggle-pw]"); if (!b) return;
  const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password";
  b.textContent = i.type === "password" ? "Ver" : "Ocultar";
}

/* ---------- Router de la cuenta ---------- */
export async function viewAccount(sub, q, id) {
  if (sub === "confirmada") return { html: authShell("Cuenta confirmada", "Tu correo quedó verificado.", `<a class="btn" href="${Booking_hasDraft() ? "#/reservar" : "#/cuenta"}">${Booking_hasDraft() ? "Continuar con mi reserva" : "Ir a mi cuenta"}</a>`) };
  if (sub === "enlace-invalido") return { html: authShell("Enlace no válido", "El enlace caducó o ya fue usado. Solicita uno nuevo.", `<a class="btn" href="#/cuenta/recuperar">Recuperar contraseña</a> <a class="btn btn--ghost" href="#/cuenta">Iniciar sesión</a>`) };
  if (sub === "nueva-clave") return State.user && Recovery.active() ? { html: viewNewPassword(), mount: () => mountAuth(q) } : { html: authShell("Enlace no válido", "Abre de nuevo el enlace de tu correo o solicita otro.", `<a class="btn" href="#/cuenta/recuperar">Solicitar enlace</a>`) };
  if (!State.user) {
    const html = sub === "registro" ? viewRegister(q) : sub === "recuperar" ? viewRecover() : viewLogin(q);
    return { html, mount: () => mountAuth(q) };
  }
  if (sub === "registro" || sub === "recuperar") { location.hash = "#/cuenta"; return { html: "" }; }
  if (sub === "reprogramar") return viewReschedule(id);
  return viewDashboard();
}
const Booking_hasDraft = () => { try { return !!JSON.parse(sessionStorage.getItem("eb_reserva"))?.serviceId; } catch { return false; } };

async function viewDashboard() {
  const p = State.profile || {};
  const isBarber = p.role === "barber" && p.barber_id;
  const [{ data: mine, error }, agenda] = await Promise.all([
    sb.from("appointments").select("*").eq("client_id", State.user.id).order("starts_at", { ascending: false }).limit(200),
    isBarber ? sb.from("appointments").select("*").eq("barber_id", p.barber_id).gte("starts_at", new Date(Date.now() - 3600e3).toISOString())
      .neq("status", "cancelada").order("starts_at").limit(100) : Promise.resolve({ data: [] })
  ]);
  if (error) return { html: `<section class="wrap">${emptyState("No pudimos cargar tus citas.", friendly(error))}</section>` };
  const now = Date.now();
  const upcoming = mine.filter((a) => new Date(a.ends_at) > now && ["pendiente", "confirmada"].includes(a.status)).reverse();
  const history = mine.filter((a) => !upcoming.includes(a));
  const limitH = Number(R().cancelacion_min_horas ?? 2);
  const canChange = (a) => new Date(a.starts_at) - now >= limitH * 3600e3;

  const card = (a, actions) => `<article class="appt">
    <div class="appt__date"><span>${new Date(a.starts_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "short" })}</span><strong>${new Date(a.starts_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric" })}</strong><span>${new Date(a.starts_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", month: "short" })}</span></div>
    <div class="appt__body">
      <div class="appt__top"><h3>${esc(a.service_name)}</h3>${statusBadge(a.status)}</div>
      <p class="muted">${fmtTime(a.starts_at)} – ${fmtTime(a.ends_at)} · ${durLabel(a.duration_min)} · con ${esc(a.barber_name)}</p>
      <p class="muted small">${esc(fmtDate(a.starts_at, { year: "numeric" }))} · ${priceLabel(a.price)}</p>
      ${a.cancel_reason && a.status === "cancelada" ? `<p class="muted small">Motivo: ${esc(a.cancel_reason)}</p>` : ""}
      ${actions && ["pendiente", "confirmada"].includes(a.status) ? (canChange(a) ? `<div class="row">
          ${R().reprogramacion_permitida !== false ? `<a class="btn btn--sm btn--ghost" href="#/cuenta/reprogramar/${a.id}">Reprogramar</a>` : ""}
          <button class="btn btn--sm btn--ghost btn--danger-text" data-cancel="${a.id}" type="button">Cancelar</button></div>`
        : `<p class="muted small">Faltan menos de ${limitH} h: para cambios escríbenos${waLink() ? ` por <a href="${esc(waLink())}" target="_blank" rel="noopener">WhatsApp</a>` : ""}.</p>`) : ""}
    </div></article>`;

  const html = `<section class="account wrap">
    <header class="account__head">
      <div><p class="eyebrow">Mi cuenta</p><h1>Hola, ${esc((p.full_name || "").split(" ")[0] || "cliente")}</h1></div>
      <div class="row"><a class="btn" href="#/reservar">Nueva reserva</a></div>
    </header>
    <div class="account__grid">
      <div>
        ${isBarber ? `<h2 class="h-sec">Mi agenda</h2>${agenda.data?.length ? agenda.data.map((a) => `<article class="appt appt--compact"><div class="appt__body">
          <div class="appt__top"><h3>${esc(fmtDate(a.starts_at))} · ${fmtTime(a.starts_at)}</h3>${statusBadge(a.status)}</div>
          <p class="muted">${esc(a.service_name)} · ${esc(a.client_name)}${a.client_phone ? ` · ${esc(a.client_phone)}` : ""}</p>
          ${a.client_notes ? `<p class="muted small">Nota: ${esc(a.client_notes)}</p>` : ""}</div></article>`).join("") : `<p class="muted">No tienes citas próximas.</p>`}` : ""}
        <h2 class="h-sec">Próximas citas</h2>
        ${upcoming.length ? upcoming.map((a) => card(a, true)).join("") : emptyState("No tienes citas próximas.", "", `<a class="btn" href="#/reservar">Reservar ahora</a>`)}
        <h2 class="h-sec">Historial</h2>
        ${history.length ? history.map((a) => card(a, false)).join("") : `<p class="muted">Aún no tienes citas anteriores.</p>`}
      </div>
      <aside class="panel">
        <h2>Mis datos</h2>
        <form class="form" id="profileForm" novalidate>
          <label class="field"><span>Nombre</span><input name="full_name" required maxlength="120" value="${esc(p.full_name)}" autocomplete="name"></label>
          <label class="field"><span>Celular</span><input name="phone" type="tel" maxlength="30" value="${esc(p.phone || "")}" autocomplete="tel"></label>
          <label class="field"><span>Correo</span><input value="${esc(State.user.email)}" disabled></label>
          <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar cambios</button>
          <p class="form-msg" id="profileMsg" role="status"></p>
        </form>
        <hr>
        <button class="btn btn--ghost btn--block" id="changePw" type="button">Cambiar contraseña</button>
        <button class="btn btn--ghost btn--block" id="logout" type="button">Cerrar sesión</button>
      </aside>
    </div></section>`;

  const mount = () => {
    $("#profileForm").addEventListener("submit", (e) => {
      e.preventDefault(); const f = formData(e.target);
      if (f.full_name.trim().length < 2) return setMsg($("#profileMsg"), "Escribe tu nombre.");
      busy(e.submitter, async () => {
        const { error } = await sb.from("profiles").update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null }).eq("id", State.user.id);
        if (error) return setMsg($("#profileMsg"), friendly(error));
        await loadProfile(); setMsg($("#profileMsg"), "Datos guardados.", true);
      });
    });
    $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = "#/"; });
    $("#changePw").addEventListener("click", () => {
      const m = modal(`<h2 class="modal__t">Cambiar contraseña</h2><form class="form" id="pwForm">${pw("password", "Nueva contraseña", "new-password")}
        <button class="btn btn--block" type="submit" data-busy="Guardando…">Guardar</button><p class="form-msg" id="pwMsg" role="alert"></p></form>`);
      m.el.addEventListener("click", togglePw);
      $("#pwForm", m.el).addEventListener("submit", (e) => {
        e.preventDefault(); const v = formData(e.target).password;
        if (!validPw(v)) return setMsg($("#pwMsg"), "Mínimo 8 caracteres, con letras y números.");
        busy(e.submitter, async () => {
          const { error } = await sb.auth.updateUser({ password: v });
          if (error) return setMsg($("#pwMsg"), friendly(error));
          m.close(); toast("Contraseña actualizada.");
        });
      });
    });
    document.querySelector(".account").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cancel]"); if (!b) return;
      if (!(await confirmDialog("¿Cancelar esta cita? El horario quedará libre para otra persona.", "Sí, cancelar", true))) return;
      busy(b, async () => {
        const { error } = await sb.rpc("cancel_my_appointment", { p_id: b.dataset.cancel, p_reason: null });
        if (error) return toast(friendly(error), "err");
        toast("Cita cancelada."); window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    });
  };
  return { html, mount };
}

async function viewReschedule(id) {
  const { data: a } = await sb.from("appointments").select("*").eq("id", id).eq("client_id", State.user.id).maybeSingle();
  if (!a || !["pendiente", "confirmada"].includes(a.status))
    return { html: `<section class="wrap narrow">${emptyState("Esta cita no se puede reprogramar.", "", `<a class="btn" href="#/cuenta">Volver</a>`)}</section>` };
  const svcActive = State.services.some((s) => s.id === a.service_id && s.active);
  let chosen = null;
  const html = `<section class="wrap narrow resched">
    <p class="eyebrow">Reprogramar</p><h1>Elige una nueva hora</h1>
    <p class="muted">${esc(a.service_name)} con ${esc(a.barber_name)} · actualmente ${esc(fmtDate(a.starts_at))} a las ${fmtTime(a.starts_at)}</p>
    ${svcActive ? `<div id="picker"></div>
    <div class="row"><button class="btn" id="doResched" type="button" disabled data-busy="Guardando…">Confirmar nueva hora</button><a class="btn btn--ghost" href="#/cuenta">Volver</a></div>
    <p class="form-msg" id="reMsg" role="alert"></p>` : `<p>Este servicio ya no está disponible en línea. Escríbenos para reprogramar.</p>`}
  </section>`;
  const mount = () => {
    if (!svcActive) return;
    const picker = mountSlotPicker($("#picker"), { serviceId: a.service_id, barberId: a.barber_id, date: ymd(new Date(a.starts_at)),
      onPick: ({ start }) => { chosen = start; $("#doResched").disabled = false; setMsg($("#reMsg"), `Nueva hora: ${fmtDate(start)} · ${fmtTime(start)}`, true); } });
    $("#doResched").addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const { error } = await sb.rpc("reschedule_my_appointment", { p_id: a.id, p_start: chosen, p_barber: null });
      if (error) { setMsg($("#reMsg"), friendly(error)); picker.reload(); return; }
      toast("Cita reprogramada."); location.hash = "#/cuenta";
    }));
  };
  return { html, mount };
}
