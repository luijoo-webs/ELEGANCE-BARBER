# Elegance Barber — Web + sistema de reservas

Web pública, reservas en línea, cuentas de cliente y panel administrativo, conectados a **Supabase**.
Mismo modelo de despliegue que La Percha: sitio estático (sin compilación) → GitHub Pages / Cloudflare, y toda la lógica sensible en Supabase (RLS + funciones SQL).

## 1. Qué hay en cada archivo

| Archivo | Para qué |
|---|---|
| `index.html`, `css/styles.css`, `assets/` | Página, estilos (editorial sobrio: negro, blanco cálido, grises y un acento latón discreto; panel admin claro) y logo real (`logo.jpg`, `logo-mark.jpg`, `hero-crown.jpg`, `favicon.png`). |
| `js/config.js` | **Aquí van la URL y la clave pública (anon) de Supabase.** Nada más. |
| `js/core.js` | Conexión, fechas en `America/Bogota`, mensajes de error en español, subida de imágenes. |
| `js/app.js` | Enrutador, franja de avisos arriba, encabezado (enlaces a la izquierda, logo al centro, iconos a la derecha; menú lateral en celular), botón flotante de WhatsApp y pie. El panel no se enlaza en la navegación pública: se entra por `#/admin`. |
| `js/public.js` | Inicio, flujo de reserva por pasos (servicio → barbero → fecha y hora → confirmar) y calendario semanal. |
| `js/account.js` | Registro, inicio de sesión, recuperación, perfil, mis citas, cancelar/reprogramar. |
| `js/admin.js` | Panel `#/admin`: resumen, agenda, citas, servicios, barberos, clientes, horarios, configuración, estadísticas (ingresos/gastos) y registro de cambios. |
| `supabase/01_esquema.sql` | Tablas, restricciones, funciones de reserva, RLS y auditoría. |
| `supabase/02_storage.sql` | Bucket `media` para fotos (lectura pública, escritura solo admin). |
| `supabase/03_finanzas.sql` | Tabla `finance_entries` (ingresos y gastos, solo admin) y función `admin_delete_appointment` (borra solo citas canceladas). |
| `supabase/04_duracion_30.sql` | Cada corte dura 30 min: duración por defecto e intervalo de horas en 30 min (solo para bases creadas antes del cambio). |
| `supabase/05_servicios.sql` | Agrega Corte full (Cortes), Keratina y Aminoácidos (Tratamientos), 30 min, precio por definir. Re-ejecutable. |
| `supabase/correos/` | Plantillas de los correos de Auth. |
| `tests/` | Pruebas del SQL y servidor local de desarrollo (no es parte del sitio). |

## 2. Información real usada y lo que falta

Tomado del Instagram **@elegancebarberr** (perfil público, sin iniciar sesión):
- Nombre: *The Elegance Of The Barber's* / Elegance Barber · Eslogan: “Tu mejor opción.”
- Dirección: Calle 19 C1 #13B-54, frente a la cancha de Las Flores.
- WhatsApp: `https://wa.me/message/LSU2MF6F7NIHM1` · Instagram.
- Identidad: logo real (corona blanca con brillo amarillo sobre ladrillo negro) → paleta sobria (negro `#141312`, fondo `#f5f2ed`, acento `#9b7d4e`) y una sola familia tipográfica: Archivo (ancho variable).

**No se inventó nada más.** Pendiente de que lo entregues (todo se carga desde el panel, sin tocar código):
- Fotos reales: portada, local, barberos y trabajos. No descargué fotos de Instagram.
  Mientras tanto la web usa **fotos de ambiente de barbería** (Unsplash, licencia libre, en `assets/fotos/`): no son del local ni del equipo. Dónde y cómo se reemplazan:
  - Portada (paneles): la *Imagen de portada* de Admin → Configuración ocupa el primer panel.
  - Servicios: la foto de cada servicio (Admin → Servicios).
  - Barberos: la foto de cada barbero (Admin → Barberos); sin foto se ve una imagen de ambiente en gris, nunca un retrato.
  - Franja de Instagram: las fotos de Galería (Admin → Configuración) van primero; las de ambiente solo completan hasta 6.
  - Franja “Reserva tu próxima cita”: imagen fija de ambiente.
- **Mapa**: se busca por la dirección. Como la dirección no dice la ciudad, completa *Ciudad* (o *Enlace de Google Maps*) en Admin → Configuración para que el mapa y las rutas de Google Maps/Waze apunten al lugar exacto.
- Ciudad (la dirección no la indica), teléfono, correo, enlace de Google Maps.
- Servicios, duraciones y **precios** (sin precio se muestra “Precio por confirmar”).
- Barberos (nombres, fotos, especialidades) y horarios de atención.
- Texto de filosofía / historia de la barbería.

Mientras no haya horario general, servicios y barberos activos, la web muestra “Las reservas en línea aún no están disponibles” y el panel avisa qué falta.

## 3. Puesta en marcha (una vez)

1. **Crear proyecto** en Supabase (región São Paulo recomendada para Colombia).
2. **SQL Editor** → pegar y ejecutar `supabase/01_esquema.sql` completo. Luego `supabase/02_storage.sql` y `supabase/03_finanzas.sql`.
   Los tres son re-ejecutables y no borran datos.
3. **Project Settings → API**: copiar *Project URL* y la clave *anon / publishable* en `js/config.js`.
   ⚠️ Nunca pongas la `service_role` ni la contraseña de la base de datos en el código ni en Git.
4. **Authentication → URL Configuration**
   - *Site URL*: el dominio final, p. ej. `https://elegancebarber.com/` (mientras tanto, la URL de GitHub Pages).
   - *Redirect URLs*: esa misma URL con y sin `www`, y `http://127.0.0.1:5180/` para pruebas locales.
5. **Authentication → Emails → Templates**: pegar `supabase/correos/1-confirmar-cuenta.html` en *Confirm signup* y `2-recuperar-contrasena.html` en *Reset password*. Asuntos sugeridos: “Confirma tu cuenta de Elegance Barber” y “Crea una nueva contraseña”.
   Los enlaces usan `token_hash` y se validan con `verifyOtp`, así funcionan aunque se abran en otro navegador.
6. **Authentication → Providers → Email**: dejar *Confirm email* activado. Contraseña mínima 8 (Authentication → Policies).
   Para producción configura **SMTP propio** (el correo integrado de Supabase permite muy pocos envíos por hora).
7. **Crear el administrador**: Authentication → Users → *Add user* (correo del dueño, contraseña segura, *Auto Confirm*). Luego en SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'CORREO_DEL_DUEÑO';
   ```
   El registro público siempre crea cuentas `client`; ningún campo del formulario puede cambiar el rol (lo garantiza un trigger en la base).
8. Abrir la web → `#/admin` → **Horarios y cierres** (horario general), **Servicios**, **Barberos**, **Configuración** (logo, fotos, contacto, reglas).

## 4. Cómo funcionan las reservas

- **Disponibilidad** (`get_availability`): horario general ∩ horario propio del barbero (si tiene) − pausas − cierres/vacaciones/bloqueos − citas existentes − horas pasadas − anticipación mínima/máxima. Cada cita ocupa la **duración completa** del servicio.
- **Sin dobles reservas**: la tabla `appointments` tiene una restricción `EXCLUDE` (barbero + intervalo de tiempo). Si dos personas confirman el mismo hueco a la vez, la base acepta una y la otra recibe “Ese horario acaba de ser reservado”. No depende del navegador.
- **Estados que ocupan horario**: `pendiente` (mientras no expire), `confirmada`, `completada`. `cancelada` libera el horario.
- **Pendientes**: solo existen si desactivas “Confirmar automáticamente”. Bloquean el horario durante *Horas para confirmar una pendiente* (12 h por defecto) o hasta la hora de la cita; después se cancelan solas en la siguiente reserva.
- **Historial intacto**: cada cita guarda nombre del servicio, duración, precio y barbero del momento. Servicios y barberos se “eliminan” de forma lógica.
- **Cancelar / reprogramar** el cliente: hasta *N* horas antes (2 h por defecto). Reprogramar valida conflictos igual que una reserva nueva.
- **Admin**: puede crear, mover y cambiar estado, pero el servidor tampoco le permite solapar citas ni agendar fuera de horario o en bloqueos. Un bloqueo nuevo que cae sobre citas existentes muestra cuántas hay (no las cancela en silencio).
- **Auditoría**: cada cambio en citas, servicios, barberos, horarios, bloqueos, configuración y roles queda en `audit_log` con quién y cuándo (Admin → Estadísticas → Registro de cambios y en el detalle de cada cita).
- **Eliminar citas**: solo las **canceladas** y solo un administrador (Admin → detalle de la cita → *Eliminar definitivamente*, con confirmación). Las activas no se pueden borrar. La copia completa de la cita borrada queda en `audit_log`; un ingreso vinculado conserva su registro.
- **Finanzas** (Admin → Estadísticas): ingresos y gastos se registran a mano (descripción, categoría, valor, fecha). El balance solo se muestra cuando hay ingresos registrados: una cita reservada o completada **no** es dinero recibido (la web no cobra en línea). El “valor estimado” de citas completadas es solo una referencia según el precio de la cita.
- Zona horaria: todo se calcula en `America/Bogota` (UTC−5, sin horario de verano).

Reglas por defecto (cámbialas en Admin → Configuración → Reglas de reserva): cada corte dura 30 min (duración por defecto de un servicio nuevo), intervalo 30 min, anticipación mínima 60 min, máxima 30 días, cancelación hasta 2 h antes, 3 citas activas por cliente, “cualquier barbero” activado.

## 5. Roles y seguridad

- **Cliente**: ve y edita solo su perfil (nombre, celular) y sus citas. Reserva/cancela/reprograma solo por funciones del servidor.
- **Administrador**: acceso total al panel. El rol se asigna por SQL o desde Admin → Clientes (con confirmación).
- **Barbero** (opcional): Admin → Clientes → rol *Barbero* + perfil vinculado. Ve su agenda en *Mi cuenta*, nada más.
- RLS activo en todas las tablas; las funciones de admin verifican `is_admin()` en la base, no en la interfaz.
- Notas internas de clientes en tabla aparte, visible solo para administradores. Nunca se muestran contraseñas.
- Los datos de prueba solo existen en el servidor local (`tests/`), nunca en Supabase.

## 6. Publicar

Igual que La Percha: subir `index.html`, `css/`, `js/` a GitHub Pages (o Cloudflare Pages) y apuntar el dominio. No hace falta compilar.
Después de publicar, actualiza *Site URL* y *Redirect URLs* en Supabase con el dominio final.
La carpeta `tests/` no contiene secretos de producción (la cuenta admin que ves ahí solo existe en la base local en memoria), pero puedes excluirla del sitio publicado.

## 7. Pruebas

```bash
cd tests && npm install
npm test          # 38 pruebas del esquema SQL (reservas, solapes, RLS, roles, estados, pendientes)
npm run dev       # web completa en http://127.0.0.1:5180 con un Supabase simulado sobre el mismo SQL
```
El servidor local usa datos ficticios marcados “(prueba)” y una cuenta admin local definida en `tests/dev-server.mjs`. No implementa Storage (subida de fotos) ni Realtime.

## 8. Qué está verificado y qué no

Verificado localmente (PGlite con el mismo SQL y RLS, y la web real en el navegador):
registro, inicio/cierre de sesión, recuperación de contraseña (con enlace simulado), reserva completa conservando la selección tras registrarse, bloqueo del horario, reservas simultáneas (solo entra una por barbero), “cualquier barbero”, cancelación que libera el hueco, reprogramación, navegación entre semanas, permisos cliente vs. admin (sin acceso a citas ajenas ni a funciones de admin, no puede hacerse admin), agenda día/semana, cita manual con validación, cambio de estado, bloqueos, horarios con pausas, servicios sin precio, configuración y auditoría.

**No verificado (requiere tu proyecto Supabase):** envío real de correos, subida de imágenes a Storage, actualización en tiempo real de la agenda, y el comportamiento con el Auth real de Supabase. Tras el paso 3, prueba: crear cuenta → confirmar correo → reservar → cancelar; y en el panel subir el logo y una foto.
