# Guía del sitio: The Elegance of the Barber

Dónde entrar para cambiar cada cosa y cómo funciona todo. Aquí no hay contraseñas ni claves secretas, y no debe haberlas.

## Cómo funciona

```
Visitante → Cloudflare (dominio, HTTPS, filtro de tráfico) → GitHub Pages (archivos de la web)
    └─ la web, ya en el navegador, habla directo con → Supabase (citas, cuentas, finanzas, correos)
```

| Servicio | Para qué sirve | Dónde entrar |
|---|---|---|
| **Spaceship** | Donde se compró el dominio. Solo apunta a los nameservers de Cloudflare. | spaceship.com → Domain Manager |
| **Cloudflare** | DNS, HTTPS, protección y encabezados de seguridad. | dash.cloudflare.com → theelegancebarber.com |
| **GitHub** | Guarda el código y publica la web. Cada cambio en `main` se publica solo en 1 o 2 minutos. | github.com/luijoo-webs/ELEGANCE-BARBER |
| **Supabase** | Base de datos, inicio de sesión, fotos y envío de correos. | supabase.com → proyecto `bmbcyngdancirqvvyfdn` |
| **Gmail** | Cuenta que envía los correos: theeleganceofthebarber@gmail.com | Sus credenciales están en Supabase → Edge Functions → Secrets |

## Quiero cambiar…

### Sin tocar código: panel de administración
Entra a `https://theelegancebarber.com/#/admin` con una cuenta de administrador.

- Citas, estados y pagos
- Servicios y precios
- Barberos y horarios
- Galería
- Finanzas
- Datos del negocio: teléfono, WhatsApp, dirección, redes

**Cambiar el WhatsApp:** en los datos del negocio, pon el número en "Teléfono / celular" y `https://wa.me/57NUMERO` en "Enlace de WhatsApp". Los dos deben coincidir: el Teléfono decide a dónde llega el mensaje de la reserva, y el Enlace, los botones de WhatsApp del sitio.

**Enlace "Ver la cita con fotos":** cada reserva lo incluye en su mensaje de WhatsApp. Quien lo tenga ve la cita sin correo ni celular, hasta 30 días después de la fecha de la cita.

### En el código (carpeta del proyecto)

| Qué | Archivo |
|---|---|
| Colores, tamaños, diseño | `css/styles.css` |
| Inicio, servicios, tienda, reservas | `js/public.js` |
| Menú y pie de página | `js/app.js` |
| Inicio de sesión y "Mi cuenta" | `js/account.js` |
| Panel de administración | `js/admin.js` |
| Mensajes de error, estados de cita, utilidades | `js/core.js` |
| Conexión a Supabase (solo clave pública) | `js/config.js` |
| Fotos y logos | `assets/` |
| Título, descripción y política de seguridad (CSP) | `index.html` |
| Diseño y texto de los correos | `supabase/functions/notificaciones/index.ts` |
| Reglas de la base de datos | `supabase/*.sql`, en orden numérico |

**Para publicar:**
1. Sube el número `?v=...` si cambiaste CSS o JS. Está en `index.html` y en los `import` de `js/`, y hay que cambiarlo en todos. Si no, los navegadores siguen usando la versión vieja.
2. Haz commit y push a `main`.

**Otros tres cambios tienen su propio paso:**
- **Base de datos:** crea un archivo SQL nuevo con el número siguiente y ejecútalo en Supabase → SQL Editor. Pruébalo antes con `cd tests` y `node sql.test.mjs`.
- **Correos:** al guardar en GitHub no se publican. Hay que pegar `index.ts` en Supabase → Edge Functions → `notificaciones` → Code y pulsar Deploy.
- **Un servicio externo nuevo** (por ejemplo un script o un mapa distinto): agrégalo a la línea `Content-Security-Policy` de `index.html`, o el navegador lo bloqueará. Las imágenes externas con `https` ya están permitidas.

### Dominio y seguridad (Cloudflare)

| Qué | Dónde |
|---|---|
| Registros DNS | DNS → Records |
| Modo de cifrado (está en Full (Strict)) | SSL/TLS → Overview |
| Redirección a HTTPS, TLS mínimo 1.2 y HSTS (1 mes, sin subdominios ni preload) | SSL/TLS → Edge Certificates |
| Bot Fight Mode | Security → Settings → Bot traffic |
| Encabezados de seguridad | Rules → Settings → Managed Transforms |
| Permissions-Policy (cámara, micrófono, ubicación, pagos y USB bloqueados) | Rules → Overview → regla "Permissions-Policy" |
| Si la web está bajo ataque | Security → Settings → activar **I'm Under Attack** |
| Si un cambio no aparece | Caching → Configuration → Purge Everything |

**No cambies** estas cosas sin revisar antes:
- Los 4 registros A (`185.199.108–111.153`) y el `www`: son los que llevan a GitHub Pages.
- El modo Flexible: no lo uses. Con GitHub Pages en HTTPS forzado puede causar un bucle de redirecciones.
- El archivo `CNAME` del repositorio: si lo borras, GitHub deja de servir el dominio.

### Cuentas y enlaces de los correos (Supabase)
- **Dirección del sitio:** Authentication → URL Configuration.
- **Clave de Gmail:** Edge Functions → Secrets → `SMTP_PASS`. Si cambias la clave en Google, actualízala aquí también.
- **Administradores:** se dan solo desde la base de datos. El registro público nunca crea administradores.

## Qué protege cada capa

- **Cloudflare** protege la web: DDoS, bots simples, HTTPS.
- **Cloudflare no protege la API de Supabase.** La web la llama directo a `supabase.co`. Esa capa queda con la protección propia de Supabase y con las reglas de la base de datos.
- **RLS y funciones de la base de datos** protegen los datos: cada cliente solo ve lo suyo y el visitante anónimo no puede leer citas ni finanzas.
- **Reservas sin cuenta:** máximo 5 por hora desde una misma IP (`supabase/13_seguridad.sql`).
- **Claves:** la clave `anon` de `js/config.js` es pública por diseño. La `service_role` y la clave de Gmail nunca deben ir en el código ni en GitHub.

## Fechas para recordar

- **Dominio:** vence el 4 de noviembre de 2027 y la renovación automática está apagada. Actívala en Spaceship o renuévalo a tiempo; si vence, la web se cae.
- **Plan de Supabase:** en el plan gratuito, los proyectos sin actividad pueden pausarse. Revisa el panel si la web deja de mostrar datos.

- **Certificado de GitHub:** cada lunes la revisión "Revisar certificado" (pestaña Actions) comprueba que falten más de 20 días. Si falla, GitHub avisa por correo a su dueño: sigue la fila "Error 526" antes de que venza.

## Si algo falla

| Síntoma | Revisa |
|---|---|
| La web no abre | Estado de la zona en Cloudflare; GitHub → Settings → Pages |
| Error 526 | El certificado de GitHub. Apaga el proxy (nube gris) en los 5 registros, espera a que GitHub lo renueve y vuelve a encenderlo |
| La web abre, pero sin citas ni datos | Supabase: proyecto activo y sin pausar |
| No llegan correos | Supabase → Edge Functions → `notificaciones` → Logs; luego `SMTP_USER` y `SMTP_PASS` |
| Algo no carga y la consola menciona Content Security Policy | Agrega ese servicio a la línea CSP de `index.html` |
| El cambio no se ve | Sube `?v=`, espera 2 minutos y usa Purge Everything |
