// Pruebas del esquema SQL en un PostgreSQL embebido (PGlite), sin tocar Supabase.
// Simula auth.users/auth.uid() y los roles anon/authenticated de Supabase.
// Ejecutar:  cd tests && npm install && npm test
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { btree_gist } });
const schema = ["01_esquema.sql", "03_finanzas.sql"].map((f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8")).join(";\n");

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(schema);
await db.exec(schema); // re-ejecutable

let passed = 0;
const ok = (name) => { passed++; console.log("  ✓", name); };
// Ejecuta como un usuario (uid) o anónimo (null) con los permisos de Supabase.
async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
async function fails(promise, code) {
  try { await promise; } catch (e) { assert.match(e.message, new RegExp(code)); return; }
  assert.fail(`se esperaba error ${code}`);
}

const U = { admin: "00000000-0000-0000-0000-00000000000a", ana: "00000000-0000-0000-0000-0000000000a1", beto: "00000000-0000-0000-0000-0000000000b1" };
await db.query(`insert into auth.users values ($1,'admin@x.co','{"full_name":"Admin"}'), ($2,'ana@x.co','{"full_name":"Ana","role":"admin"}'), ($3,'beto@x.co','{"full_name":"Beto"}')`, [U.admin, U.ana, U.beto]);
await db.query(`update profiles set role='admin' where id=$1`, [U.admin]); // como en el SQL Editor

const [{ d }] = (await db.query(`select to_char((now() at time zone 'America/Bogota')::date + 1, 'YYYY-MM-DD') d`)).rows;
const T = (hhmm) => `${d}T${hhmm}:00-05:00`;

console.log("Perfiles y roles");
assert.equal((await db.query(`select role from profiles where id=$1`, [U.ana])).rows[0].role, "client");
ok("el registro ignora role en metadata (queda client)");
await as(U.ana, `update profiles set role='admin', full_name='Ana M' where id=$1`, [U.ana]);
const ana = (await db.query(`select role, full_name from profiles where id=$1`, [U.ana])).rows[0];
assert.deepEqual([ana.role, ana.full_name], ["client", "Ana M"]);
ok("un cliente no puede hacerse admin, pero sí editar su nombre");
assert.equal((await as(U.ana, `select * from profiles`)).length, 1);
ok("un cliente solo ve su propio perfil");

console.log("Catálogo y horarios (como admin)");
const [svc] = await as(U.admin, `insert into services(name, duration_min) values ('Corte', 45) returning id`);
const [svc2] = await as(U.admin, `insert into services(name, duration_min, active) values ('Oculto', 30, false) returning id`);
const [b1] = await as(U.admin, `insert into barbers(name, sort_order) values ('B1', 1) returning id`);
const [b2] = await as(U.admin, `insert into barbers(name, sort_order) values ('B2', 2) returning id`);
await as(U.admin, `insert into schedules(barber_id, weekday, start_time, end_time) select null, g, '08:00', '20:00' from generate_series(0,6) g`);
await fails(as(U.ana, `insert into services(name, duration_min) values ('X', 30)`), "row-level security");
ok("un cliente no puede crear servicios");
assert.equal((await as(null, `select * from services`)).length, 1);
ok("el público no ve servicios inactivos");

console.log("Disponibilidad");
// El valor por defecto es 30 min; estas pruebas miden el bloqueo con pasos de 15.
await db.query(`update settings set value = value || '{"intervalo_min": 15}' where key = 'reservas'`);
const slots = await as(null, `select barber_id, slot_start from get_availability($1, null, $2::date, 7)`, [svc.id, d]);
assert.ok(slots.length > 0);
assert.ok(slots.every((s) => new Date(s.slot_start) > new Date(Date.now() + 59 * 60000)));
ok(`el anónimo consulta horas libres (${slots.length}) y ninguna es pasada`);
const lastDay = await as(null, `select max(slot_start) m from get_availability($1, $2, ((now() at time zone 'America/Bogota')::date + 40), 7)`, [svc.id, b1.id]);
assert.equal(lastDay[0].m, null);
ok("no hay horas más allá de la anticipación máxima");
const late = await as(null, `select count(*)::int n from get_availability($1, $2, $3::date, 1) where slot_start > $4`, [svc.id, b1.id, d, T("19:15")]);
assert.equal(late[0].n, 0);
ok("un servicio de 45 min no empieza si no termina antes del cierre (20:00)");

console.log("Reservas y bloqueo de horario");
await fails(as(null, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("10:00")]), "permission denied|NO_AUTENTICADO");
ok("sin sesión no se puede reservar");
const [{ book_appointment: a1 }] = await as(U.ana, `select book_appointment($1, $2, $3, 'hola')`, [svc.id, b1.id, T("10:00")]);
ok("Ana reserva B1 10:00–10:45");
await fails(as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("10:30")]), "HORARIO_OCUPADO");
ok("Beto no puede solapar con B1 10:30");
const free = (await as(null, `select slot_start from get_availability($1, $2, $3::date, 1)`, [svc.id, b1.id, d])).map((r) => new Date(r.slot_start).getTime());
for (const h of ["09:30", "10:00", "10:15", "10:30"]) assert.ok(!free.includes(new Date(T(h)).getTime()), h);
for (const h of ["09:15", "10:45"]) assert.ok(free.includes(new Date(T(h)).getTime()), h);
ok("la disponibilidad descuenta los 45 min completos (09:15 y 10:45 siguen libres)");
await as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b2.id, T("10:00")]);
ok("B2 es independiente: Beto reserva B2 10:00");
await fails(as(U.beto, `select book_appointment($1, null, $2)`, [svc.id, T("10:15")]), "HORARIO_OCUPADO");
ok("“cualquier barbero” falla si todos están ocupados");
const [{ book_appointment: a3 }] = await as(U.beto, `select book_appointment($1, null, $2)`, [svc.id, T("12:00")]);
assert.ok(a3);
ok("“cualquier barbero” asigna uno libre");
await fails(db.query(`insert into appointments(barber_id, service_name, duration_min, starts_at, ends_at) values ($1,'x',30,$2,$3)`, [b1.id, T("10:20"), T("10:50")]), "appointments_no_overlap");
ok("la restricción EXCLUDE bloquea el solapamiento incluso con inserción directa (atómico)");
await fails(as(U.ana, `insert into appointments(barber_id, service_name, duration_min, starts_at, ends_at) values ($1,'x',30,$2,$3)`, [b1.id, T("15:00"), T("15:30")]), "permission denied");
ok("un cliente no puede insertar citas sin pasar por la función");
await fails(as(U.ana, `select book_appointment($1, $2, $3)`, [svc2.id, b1.id, T("16:00")]), "SERVICIO_NO_DISPONIBLE");
ok("no se reservan servicios inactivos");
await fails(as(U.ana, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, new Date(Date.now() + 10 * 60000).toISOString()]), "ANTICIPACION_MINIMA|FUERA_DE_HORARIO");
ok("no se reserva sin la anticipación mínima");

console.log("Privacidad");
assert.equal((await as(U.beto, `select * from appointments`)).length, 2);
assert.equal((await as(U.ana, `select * from appointments`)).length, 1);
assert.equal((await as(null, `select * from appointments`).catch(() => [])).length, 0);
ok("cada cliente ve solo sus citas; el anónimo ninguna");
assert.equal((await as(U.admin, `select * from appointments`)).length, 3);
ok("el admin ve todas");

console.log("Cancelación y reprogramación");
await fails(as(U.beto, `select cancel_my_appointment($1)`, [a1]), "CITA_NO_ENCONTRADA");
ok("Beto no puede cancelar la cita de Ana");
await as(U.ana, `select cancel_my_appointment($1, 'no puedo')`, [a1]);
const [{ book_appointment: a4 }] = await as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("10:00")]);
ok("al cancelar se libera el horario y otro cliente lo toma");
await fails(as(U.beto, `select reschedule_my_appointment($1, $2, $3)`, [a4, T("10:15"), b2.id]), "HORARIO_OCUPADO");
await as(U.beto, `select reschedule_my_appointment($1, $2)`, [a4, T("13:00")]);
const moved = await as(null, `select count(*)::int n from get_availability($1, $2, $3::date, 1) where slot_start = $4`, [svc.id, b1.id, d, T("10:00")]);
assert.equal(moved[0].n, 1);
ok("reprogramar valida conflictos y libera el horario anterior");

console.log("Bloqueos, horarios por barbero y barbero inactivo");
await as(U.admin, `insert into time_off(barber_id, starts_at, ends_at, kind) values (null, $1, $2, 'cierre')`, [T("14:00"), T("16:00")]);
await fails(as(U.ana, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("14:30")]), "HORARIO_BLOQUEADO");
ok("un cierre del negocio bloquea a todos los barberos");
const dow = (await db.query(`select extract(dow from $1::date)::int w`, [d])).rows[0].w;
await as(U.admin, `insert into schedules(barber_id, weekday, start_time, end_time) values ($1, $2, '08:00','12:00'), ($1, $2, '13:00','20:00')`, [b2.id, (dow + 1) % 7]);
assert.equal((await as(null, `select * from get_availability($1, $2, $3::date, 1)`, [svc.id, b2.id, d])).length, 0);
ok("un barbero con horario propio no aparece en su día libre");
const nextDay = (await db.query(`select to_char($1::date + 1, 'YYYY-MM-DD') x`, [d])).rows[0].x;
const b2next = (await as(null, `select slot_start from get_availability($1, $2, $3::date, 1)`, [svc.id, b2.id, nextDay])).map((r) => new Date(r.slot_start).getTime());
assert.ok(!b2next.includes(new Date(`${nextDay}T11:30:00-05:00`).getTime()) && !b2next.includes(new Date(`${nextDay}T12:15:00-05:00`).getTime()));
assert.ok(b2next.includes(new Date(`${nextDay}T13:00:00-05:00`).getTime()));
ok("la pausa 12:00–13:00 del barbero no admite citas que la crucen");
await as(U.admin, `update barbers set active=false where id=$1`, [b2.id]);
await fails(as(U.ana, `select book_appointment($1, $2, $3)`, [svc.id, b2.id, T("17:00")]), "BARBERO_NO_DISPONIBLE");
ok("no se asignan citas a un barbero inactivo");
await as(U.admin, `update barbers set active=true where id=$1`, [b2.id]);

console.log("Admin");
await fails(as(U.ana, `select admin_stats(current_date, current_date)`), "NO_AUTORIZADO");
await fails(as(U.ana, `select admin_set_status($1, 'cancelada')`, [a4]), "NO_AUTORIZADO");
ok("un cliente no puede usar funciones de admin");
await fails(as(U.admin, `select admin_save_appointment(null, null, 'Walk-in', '300', $1, $2, $3)`, [svc.id, b1.id, T("13:15")]), "HORARIO_OCUPADO");
ok("el admin tampoco puede crear un conflicto");
await fails(as(U.admin, `select admin_save_appointment(null, null, 'Walk-in', '300', $1, $2, $3)`, [svc.id, b1.id, T("21:00")]), "FUERA_DE_HORARIO");
ok("el admin no agenda fuera del horario");
const [{ admin_save_appointment: w }] = await as(U.admin, `select admin_save_appointment(null, null, 'Walk-in', '300', $1, $2, $3, 'nota')`, [svc.id, b1.id, T("17:00")]);
await fails(as(U.admin, `select admin_save_appointment($1, null, '', '', $2, $3, $4)`, [w, svc.id, b2.id, T("17:00")]), "FUERA_DE_HORARIO");
await as(U.admin, `select admin_save_appointment($1, null, '', '', $2, $3, $4, 'movida')`, [w, svc.id, b2.id, `${nextDay}T17:00:00-05:00`]);
assert.equal((await as(null, `select count(*)::int n from get_availability($1, $2, $3::date, 1) where slot_start = $4`, [svc.id, b1.id, d, T("17:00")]))[0].n, 1);
ok("el admin crea una cita manual y la mueve a otro barbero/día (respetando su horario)");
await fails(as(U.admin, `select admin_set_status($1, 'completada')`, [w]), "CITA_FUTURA");
await as(U.admin, `select admin_set_status($1, 'cancelada', 'cliente avisó')`, [w]);
await fails(as(U.admin, `select admin_set_status($1, 'confirmada')`, [w]), "TRANSICION_INVALIDA");
ok("transiciones de estado validadas");
const [{ admin_stats: st }] = await as(U.admin, `select admin_stats(current_date, current_date + 7)`);
assert.equal(st.clientes, 2);
assert.ok(st.canceladas >= 2 && st.por_barbero.length > 0 && st.por_dia.length === 8);
ok("indicadores del panel");
const audit = await as(U.admin, `select * from audit_log where entity='appointments' and actor=$1`, [U.admin]);
assert.ok(audit.length >= 3);
assert.equal((await as(U.ana, `select * from audit_log`)).length, 0);
ok("auditoría registra al admin y no es visible para clientes");

console.log("Reservas pendientes");
await fails(as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("19:00")]), "LIMITE_RESERVAS");
ok("límite de reservas activas por cliente (3)");
await db.query(`update settings set value = value || '{"confirmacion_automatica": false, "max_reservas_activas": 10}' where key='reservas'`);
const [{ book_appointment: p1 }] = await as(U.ana, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("18:00")]);
assert.equal((await db.query(`select status from appointments where id=$1`, [p1])).rows[0].status, "pendiente");
await fails(as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("18:00")]), "HORARIO_OCUPADO");
ok("una pendiente vigente bloquea el horario");
await db.query(`update appointments set pending_expires_at = now() - interval '1 minute' where id=$1`, [p1]);
await as(U.beto, `select book_appointment($1, $2, $3)`, [svc.id, b1.id, T("18:00")]);
assert.equal((await db.query(`select status from appointments where id=$1`, [p1])).rows[0].status, "cancelada");
ok("una pendiente vencida se libera y el horario se puede reservar");

console.log("Finanzas y limpieza de citas");
const [cancelled] = (await db.query(`select id from appointments where status='cancelada' limit 1`)).rows;
const [active] = (await db.query(`select id from appointments where status in ('confirmada','pendiente') limit 1`)).rows;
await fails(as(U.ana, `select admin_delete_appointment($1)`, [cancelled.id]), "NO_AUTORIZADO");
await fails(as(U.admin, `select admin_delete_appointment($1)`, [active.id]), "SOLO_CANCELADAS");
await fails(as(U.ana, `delete from appointments where id=$1`, [cancelled.id]), "permission denied");
ok("solo el admin borra, y solo citas canceladas");
const [inc] = await as(U.admin, `insert into finance_entries(kind, description, category, amount, entry_date, appointment_id) values ('ingreso','Pago corte','Servicios',30000,current_date,$1) returning id`, [cancelled.id]);
await as(U.admin, `select admin_delete_appointment($1)`, [cancelled.id]);
assert.equal((await db.query(`select count(*)::int n from appointments where id=$1`, [cancelled.id])).rows[0].n, 0);
assert.equal((await db.query(`select appointment_id from finance_entries where id=$1`, [inc.id])).rows[0].appointment_id, null);
const del = (await db.query(`select details from audit_log where entity='appointments' and action='delete' and entity_id=$1`, [cancelled.id])).rows;
assert.equal(del.length, 1); assert.equal(del[0].details.status, "cancelada");
ok("borrar una cancelada conserva el ingreso vinculado y deja la fila completa en auditoría");
await as(U.admin, `insert into finance_entries(kind, description, category, amount, entry_date) values ('gasto','Arriendo','Arriendo',800000,current_date)`);
await fails(as(U.admin, `insert into finance_entries(kind, description, category, amount, entry_date) values ('gasto','X','Y',0,current_date)`), "check");
assert.equal((await as(U.ana, `select * from finance_entries`)).length, 0);
await fails(as(U.ana, `insert into finance_entries(kind, description, category, amount, entry_date) values ('gasto','X','Y',1,current_date)`), "row-level security");
await fails(as(null, `select * from finance_entries`), "permission denied");
assert.equal((await as(U.admin, `select * from finance_entries`)).length, 2);
ok("finanzas: solo el admin las ve y edita; montos deben ser positivos");

console.log("Migración 04 (negocio real + consentimiento)");
const mig = readFileSync(new URL("../supabase/04_negocio_real.sql", import.meta.url), "utf8");
await db.exec(mig); await db.exec(mig);
const reales = await db.query(`select name, duration_min, price from services where description = 'Incluye lavado de cabello.' order by sort_order`);
assert.equal(reales.rows.length, 13); assert.ok(reales.rows.every((r) => r.duration_min === 35));
assert.equal(Number(reales.rows.find((r) => r.name === "Corte y keratina").price), 60000);
assert.equal((await db.query(`select value->>'intervalo_min' v from settings where key = 'reservas'`)).rows[0].v, "35");
ok("04 es re-ejecutable: 13 servicios reales de 35 min sin duplicar, intervalo 35");
await as(null, `select log_consent(array['terminos','privacidad'], '2026-10', 'registro', 'X@Y.co', 'Ana', 'http://x', 'UA')`);
const cl = await as(U.admin, `select document from consent_log where email = 'x@y.co' order by document`);
assert.deepEqual(cl.map((r) => r.document), ["privacidad", "terminos"]);
assert.equal((await as(U.ana, `select * from consent_log`)).length, 0);
await fails(as(U.ana, `insert into consent_log(document, version, form) values ('terminos','1','registro')`), "permission denied");
await fails(as(U.admin, `delete from consent_log`), "permission denied");
ok("consentimiento: se registra por función, solo el admin lo lee, nadie lo edita ni borra");

console.log(`\n${passed} pruebas OK`);
