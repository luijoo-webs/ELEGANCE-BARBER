/* Documentos legales (Colombia): términos, privacidad (Ley 1581 de 2012), cookies y reembolsos (Ley 1480 de 2011). */
import { State, esc, safeUrl, waLink, LEGAL_VERSION } from "./core.js";

const PEND = `<em class="is-pending">pendiente de completar en Admin → Configuración</em>`;
function who() {
  const n = State.settings.negocio || {};
  const v = (x) => (x ? esc(x) : PEND);
  return {
    name: esc(n.nombre || "The Elegance of the Barber"),
    card: `<ul class="legal__id">
      <li><b>Responsable:</b> ${v(n.titular)}, propietario(a) del establecimiento ${esc(n.nombre || "The Elegance of the Barber")}</li>
      <li><b>NIT / C.C.:</b> ${v(n.nit)}</li>
      <li><b>Dirección:</b> ${v([n.direccion, n.ciudad].filter(Boolean).join(", "))}</li>
      <li><b>Correo:</b> ${v(n.correo)}</li>
      <li><b>Teléfono / WhatsApp:</b> ${n.telefono ? esc(n.telefono) : waLink() ? `<a href="${esc(waLink())}" target="_blank" rel="noopener">WhatsApp</a>` : PEND}</li>
      ${safeUrl(n.instagram) ? `<li><b>Instagram:</b> <a href="${esc(n.instagram)}" target="_blank" rel="noopener">${esc(n.instagram)}</a></li>` : ""}
    </ul>`
  };
}

const DOCS = {
  terminos: ["Términos y condiciones", (w, r) => `
    <p>Estos términos regulan el uso de este sitio web y del sistema de reservas de ${w.name}. Al crear una cuenta o reservar, aceptas estos términos de forma electrónica (Ley 527 de 1999); guardamos la fecha, la hora y la versión que aceptaste.</p>
    <h2>1. Quiénes somos</h2>${w.card}
    <h2>2. El servicio</h2>
    <p>El sitio permite consultar servicios y precios, y reservar una hora con un barbero. <b>No se cobra nada en línea</b>: el pago se hace en la barbería después del servicio. Los precios están en pesos colombianos y son el valor final que pagas. El lavado de cabello está incluido en todos los servicios.</p>
    <h2>3. Reservas</h2>
    <ul><li>Cada turno dura ${r.intervalo_min || 35} minutos. Debes dar datos reales (nombre y celular) para que podamos contactarte sobre tu cita.</li>
      <li>Puedes cancelar o reprogramar desde tu cuenta hasta ${r.cancelacion_min_horas ?? 2} horas antes de la cita.</li>
      <li>Si llegas tarde, es posible que debamos acortar o reprogramar el servicio para no afectar al siguiente cliente.</li>
      <li>La barbería puede reprogramar o cancelar una cita por fuerza mayor; en ese caso te avisaremos por los datos de contacto que diste.</li>
      <li>Para servicios a menores de edad, la reserva la debe hacer su padre, madre o representante legal.</li></ul>
    <h2>4. Tu cuenta</h2>
    <p>Eres responsable de mantener tu contraseña en reserva. Podemos suspender cuentas usadas para reservas falsas o abusivas.</p>
    <h2>5. Garantía y reclamos</h2>
    <p>Respondemos por la calidad e idoneidad del servicio según el Estatuto del Consumidor (Ley 1480 de 2011). Si no quedas conforme, escríbenos dentro de los 3 días siguientes y revisaremos tu caso; ver la <a href="#/legal/reembolsos">política de cancelación y reembolso</a>. También puedes acudir a la <a href="https://www.sic.gov.co" target="_blank" rel="noopener">Superintendencia de Industria y Comercio</a>.</p>
    <h2>6. Datos personales y cookies</h2>
    <p>Ver la <a href="#/legal/privacidad">política de privacidad</a> y la <a href="#/legal/cookies">política de cookies</a>.</p>
    <h2>7. Ley aplicable</h2><p>Estos términos se rigen por las leyes de la República de Colombia.</p>`],

  privacidad: ["Política de tratamiento de datos personales", (w) => `
    <p>En cumplimiento de la Ley 1581 de 2012 y el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013), informamos cómo tratamos tus datos personales.</p>
    <h2>1. Responsable del tratamiento</h2>${w.card}
    <h2>2. Datos que recolectamos</h2>
    <ul><li>Nombre completo, correo electrónico y número de celular.</li>
      <li>Tus citas: servicio, barbero, fecha, hora, notas que escribas y su estado.</li>
      <li>Registro de aceptación: fecha y hora, versión del documento, formulario, navegador y dirección IP.</li></ul>
    <p>No pedimos datos sensibles. Los datos de menores de edad solo se tratan con autorización de su representante legal y respetando su interés superior.</p>
    <h2>3. Para qué los usamos</h2>
    <ul><li>Crear y administrar tu cuenta y tus reservas.</li>
      <li>Contactarte sobre tu cita (confirmación, cambios o cancelación) por llamada, WhatsApp o correo.</li>
      <li>Llevar el historial de servicios y la contabilidad interna de la barbería.</li>
      <li>Demostrar que diste tu autorización y atender requerimientos de autoridades.</li></ul>
    <p>No vendemos ni cedemos tus datos. Solo te enviaremos publicidad si lo autorizas aparte, y respetando los horarios de la Ley 2300 de 2023.</p>
    <h2>4. Quién más accede</h2>
    <p>Los datos se guardan en Supabase (proveedor de base de datos en la nube), que actúa como encargado del tratamiento y puede almacenarlos fuera de Colombia con medidas de seguridad adecuadas. Dentro de la barbería solo los administradores ven la información de clientes.</p>
    <h2>5. Tus derechos</h2>
    <p>Puedes, de forma gratuita: conocer, actualizar y rectificar tus datos; pedir prueba de la autorización; saber cómo los usamos; revocar la autorización o pedir que los eliminemos (cuando no exista un deber legal de conservarlos); y presentar quejas ante la <a href="https://www.sic.gov.co" target="_blank" rel="noopener">Superintendencia de Industria y Comercio</a>, después de haber hecho tu solicitud ante nosotros.</p>
    <h2>6. Cómo ejercerlos</h2>
    <p>Escríbenos a los datos de contacto de arriba indicando tu nombre, correo y lo que solicitas. Puedes actualizar nombre y celular tú mismo en <a href="#/cuenta">Mi cuenta</a>.</p>
    <ul><li><b>Consultas:</b> respondemos en máximo 10 días hábiles (prorrogables 5 días más, avisándote el motivo).</li>
      <li><b>Reclamos</b> (corrección, actualización, supresión o revocatoria): máximo 15 días hábiles (prorrogables 8 días más, avisándote el motivo).</li></ul>
    <h2>7. Seguridad y conservación</h2>
    <p>Usamos conexión cifrada, contraseñas que no podemos ver y permisos por usuario en la base de datos. Conservamos los datos mientras tengas cuenta o mientras sean necesarios para las finalidades anteriores y las obligaciones legales.</p>
    <h2>8. Vigencia</h2><p>Esta política rige desde el ${esc(LEGAL_VERSION)}. Si cambia, lo publicaremos aquí y te pediremos aceptarla de nuevo cuando sea necesario.</p>`],

  cookies: ["Política de cookies", () => `
    <p>Las cookies y el almacenamiento local son pequeños archivos que el navegador guarda en tu dispositivo.</p>
    <h2>1. Lo que usamos</h2>
    <ul><li><b>Estrictamente necesarios</b> (almacenamiento local): mantener tu sesión iniciada, recordar la reserva que estás armando y tu elección sobre cookies. Sin ellos el sitio no funciona, por eso no requieren consentimiento.</li>
      <li><b>De terceros (opcionales):</b> el mapa de Google Maps de la sección Visítanos. Google puede poner sus propias cookies cuando el mapa se carga, por eso solo lo mostramos si lo aceptas.</li></ul>
    <p>No usamos cookies de analítica ni de publicidad.</p>
    <h2>2. Cómo cambiar tu elección</h2>
    <p><button type="button" class="btn btn--sm btn--ghost" data-cookies="reset">Cambiar mi elección de cookies</button> También puedes borrar los datos del sitio desde la configuración de tu navegador.</p>
    <p>Más información sobre las cookies de Google: <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener">policies.google.com</a>.</p>`],

  reembolsos: ["Política de cancelación y reembolso", (w, r) => `
    <h2>1. No cobramos en línea</h2>
    <p>Reservar es gratis. El pago se hace en la barbería, después de recibir el servicio, por lo que normalmente no hay nada que reembolsar si cancelas.</p>
    <h2>2. Cancelar o reprogramar</h2>
    <p>Puedes hacerlo desde <a href="#/cuenta">Mi cuenta</a> hasta ${r.cancelacion_min_horas ?? 2} horas antes de la cita, sin costo. Después de ese plazo, escríbenos por WhatsApp.</p>
    <h2>3. Si pagaste y no recibiste el servicio</h2>
    <p>Si pagaste por adelantado en la barbería y el servicio no se pudo prestar por causa nuestra, te devolvemos el 100% por el mismo medio de pago, o lo reprogramamos si así lo prefieres.</p>
    <h2>4. Garantía</h2>
    <p>Si no quedas conforme con el resultado, escríbenos dentro de los 3 días siguientes. Según el Estatuto del Consumidor (Ley 1480 de 2011), revisaremos el caso y, si corresponde, repetiremos o corregiremos el servicio sin costo; si no fuera posible, devolveremos lo pagado.</p>
    <h2>5. Contacto</h2>${w.card}`]
};

export function viewLegal(doc) {
  const d = DOCS[doc] || DOCS.terminos;
  const nav = Object.entries(DOCS).map(([k, [t]]) => `<a href="#/legal/${k}" class="${DOCS[doc] === DOCS[k] ? "is-on" : ""}">${t}</a>`).join("");
  return `<section class="wrap legal"><nav class="legal__nav" aria-label="Documentos legales">${nav}</nav>
    <article class="legal__doc"><p class="label">Versión ${esc(LEGAL_VERSION)}</p><h1>${d[0]}</h1>${d[1](who(), State.settings.reservas || {})}</article></section>`;
}
