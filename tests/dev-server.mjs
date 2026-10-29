// SOLO DESARROLLO: servidor local que imita la API de Supabase (REST + Auth)
// sobre PostgreSQL embebido (PGlite) con el MISMO esquema y RLS de supabase/01_esquema.sql.
// Sirve la web en http://127.0.0.1:5180 y sustituye js/config.js para apuntar aquí.
// Los datos viven en memoria y son ficticios ("(prueba)"): nunca tocan Supabase.
// No implementa Storage (subida de imágenes) ni Realtime.
//   cd tests && npm install && npm run dev
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5180;
const ADMIN = { email: "admin@elegance.test", password: "DevAdmin2026" };   // cuenta local de prueba (solo PGlite)

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
for (const f of ["01_esquema.sql", "03_finanzas.sql"]) await db.exec(readFileSync(join(ROOT, "supabase", f), "utf8"));

/* ---------- Auth simulado ---------- */
const passwords = new Map();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenFor = (u) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.dev`;
const subOf = (auth) => { try { return JSON.parse(Buffer.from(auth.split(".")[1], "base64url")).sub || null; } catch { return null; } };
async function userById(id) {
  const r = (await db.query("select id, email, raw_user_meta_data, created_at from auth.users where id=$1", [id])).rows[0];
  return r && { id: r.id, aud: "authenticated", role: "authenticated", email: r.email, user_metadata: r.raw_user_meta_data, app_metadata: { provider: "email" }, created_at: r.created_at, email_confirmed_at: r.created_at };
}
const session = (user) => ({ access_token: tokenFor(user), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `rt-${user.id}`, user });
async function signUp(email, password, data = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email.toLowerCase(), data]);
  passwords.set(email.toLowerCase(), password);
  return userById(id);
}

async function handleAuth(req, url, body, res) {
  const path = url.pathname.replace("/auth/v1/", "");
  const bad = (msg, code = 400) => send(res, code, { error: "invalid_request", error_description: msg, msg });
  if (path === "signup") {
    const email = String(body.email || "").toLowerCase();
    if ((await db.query("select 1 from auth.users where email=$1", [email])).rows.length) return bad("User already registered", 422);
    if (String(body.password || "").length < 8) return bad("Password should be at least 8 characters.", 422);
    return send(res, 200, session(await signUp(email, body.password, body.data)));
  }
  if (path === "token") {
    const grant = url.searchParams.get("grant_type");
    let id;
    if (grant === "password") {
      const email = String(body.email || "").toLowerCase();
      if (passwords.get(email) !== body.password) return bad("Invalid login credentials");
      id = (await db.query("select id from auth.users where email=$1", [email])).rows[0].id;
    } else id = String(body.refresh_token || "").replace("rt-", "");
    const u = await userById(id); return u ? send(res, 200, session(u)) : bad("Invalid Refresh Token");
  }
  const uid = subOf(req.headers.authorization || "");
  if (path === "user") {
    const u = uid && await userById(uid); if (!u) return bad("invalid JWT", 401);
    if (req.method === "PUT" && body.password) passwords.set(u.email, body.password);
    return send(res, 200, u);
  }
  if (path === "logout") return send(res, 204);
  if (path === "recover") {
    const u = (await db.query("select id from auth.users where email=$1", [String(body.email || "").toLowerCase()])).rows[0];
    if (u) console.log(`[correo simulado] recuperación: http://127.0.0.1:${PORT}/?token_hash=dev-${u.id}&type=recovery`);
    return send(res, 200, {});
  }
  if (path === "verify") {
    const u = await userById(String(body.token_hash || "").replace("dev-", ""));
    return u ? send(res, 200, session(u)) : bad("Token has expired or is invalid", 403);
  }
  return bad("not implemented", 404);
}

/* ---------- PostgREST mínimo (lo que usa la web) ---------- */
const ident = (c) => { if (!/^[a-z_][a-z0-9_]*$/i.test(c)) throw Object.assign(new Error(`columna no válida: ${c}`), { code: "PGRST100" }); return `"${c}"`; };
function cond(col, expr, params) {
  const [op, ...rest] = expr.split("."), v = rest.join(".");
  const p = (x) => { params.push(x); return `$${params.length}`; };
  const c = ident(col);
  switch (op) {
    case "eq": return `${c} = ${p(v)}`;
    case "neq": return `${c} <> ${p(v)}`;
    case "gt": return `${c} > ${p(v)}`;
    case "gte": return `${c} >= ${p(v)}`;
    case "lt": return `${c} < ${p(v)}`;
    case "lte": return `${c} <= ${p(v)}`;
    case "is": return `${c} is ${v === "null" ? "null" : v === "true" ? "true" : "false"}`;
    case "ilike": return `${c}::text ilike ${p(v.replace(/\*/g, "%"))}`;
    case "in": return `${c}::text = any(${p(v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")))}::text[])`;
    default: throw Object.assign(new Error(`operador no soportado: ${op}`), { code: "PGRST100" });
  }
}
function where(sp, params) {
  const parts = [];
  for (const [k, v] of sp) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") { parts.push(`(${v.replace(/^\(|\)$/g, "").split(",").map((x) => { const [col, ...r] = x.split("."); return cond(col, r.join("."), params); }).join(" or ")})`); continue; }
    parts.push(cond(k, v, params));
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}
const pkCache = {};
async function pk(table, tx) {
  return pkCache[table] ||= (await tx.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=$1::regclass and i.indisprimary`, [`public.${table}`])).rows.map((r) => r.attname);
}

async function handleRest(req, url, body, res, tx) {
  const path = url.pathname.replace("/rest/v1/", "");
  const prefer = req.headers.prefer || "";
  const params = [];
  if (path.startsWith("rpc/")) {
    const fn = path.slice(4); ident(fn);
    const args = Object.entries(body || {});
    const sql = `select * from public.${ident(fn)}(${args.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
    const r = await tx.query(sql, args.map(([, v]) => v));
    const scalar = r.fields.length === 1 && r.fields[0].name === fn;
    return send(res, 200, scalar ? r.rows[0]?.[fn] ?? null : r.rows);
  }
  const table = ident(path);
  const sp = url.searchParams;
  if (req.method === "GET" || req.method === "HEAD") {
    const cols = (sp.get("select") || "*") === "*" ? "*" : sp.get("select").split(",").map(ident).join(",");
    const w = where(sp, params);
    let sql = `select ${cols} from public.${table}${w}`;
    if (sp.get("order")) sql += " order by " + sp.get("order").split(",").map((o) => { const [c, d, n] = o.split("."); return `${ident(c)} ${d === "desc" ? "desc" : "asc"}${n === "nullslast" ? " nulls last" : n === "nullsfirst" ? " nulls first" : ""}`; }).join(", ");
    let from = 0, to = null;
    const range = req.headers.range;
    if (range) [from, to] = range.split("-").map(Number);
    if (sp.get("limit")) to = from + Number(sp.get("limit")) - 1;
    if (sp.get("offset")) from = Number(sp.get("offset"));
    const all = (await tx.query(sql, params)).rows;
    const rows = to == null ? all.slice(from) : all.slice(from, to + 1);
    const headers = {};
    if (/count=exact/.test(prefer)) headers["Content-Range"] = `${rows.length ? `${from}-${from + rows.length - 1}` : "*"}/${all.length}`;
    if (req.method === "HEAD") return send(res, 200, undefined, headers);
    if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
      if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
      return send(res, 200, rows[0], headers);
    }
    return send(res, 200, rows, headers);
  }
  const ret = /return=representation/.test(prefer);
  if (req.method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const out = [];
    for (const row of list) {
      const keys = Object.keys(row);
      const ps = keys.map((k) => row[k]);
      let sql = `insert into public.${table} (${keys.map(ident).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`;
      if (/merge-duplicates/.test(prefer)) {
        const k = sp.get("on_conflict")?.split(",") || await pk(path, tx);
        sql += ` on conflict (${k.map(ident).join(",")}) do update set ${keys.filter((x) => !k.includes(x)).map((x) => `${ident(x)} = excluded.${ident(x)}`).join(", ")}`;
      }
      out.push(...(await tx.query(sql + " returning *", ps)).rows);
    }
    return send(res, 201, ret ? out : undefined);
  }
  if (req.method === "PATCH") {
    const keys = Object.keys(body);
    keys.forEach((k) => params.push(body[k]));
    const set = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(", ");
    const r = await tx.query(`update public.${table} set ${set}${where(sp, params)} returning *`, params);
    return send(res, ret ? 200 : 204, ret ? r.rows : undefined);
  }
  if (req.method === "DELETE") {
    const r = await tx.query(`delete from public.${table}${where(sp, params)} returning *`, params);
    return send(res, ret ? 200 : 204, ret ? r.rows : undefined);
  }
}

/* ---------- HTTP ---------- */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS", "Access-Control-Expose-Headers": "Content-Range" };
function send(res, status, data, headers = {}) {
  res.writeHead(status, { ...CORS, ...(data !== undefined ? { "Content-Type": "application/json" } : {}), ...headers });
  res.end(data !== undefined ? JSON.stringify(data) : undefined);
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
let queue = Promise.resolve();   // PGlite usa una sola conexión: serializamos peticiones

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204);
  if (url.pathname === "/js/config.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(`export const SUPABASE_URL = "http://127.0.0.1:${PORT}";\nexport const SUPABASE_ANON_KEY = "dev-anon";\n`);
  }
  if (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/")) {
    let raw = ""; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    queue = queue.then(async () => {
      const t0 = Date.now();
      if (process.env.DEV_LOG) console.log("→", req.method, url.pathname + url.search);
      try {
        if (url.pathname.startsWith("/auth/v1/")) return await handleAuth(req, url, body, res);
        const sub = subOf(req.headers.authorization || "");
        await db.transaction(async (tx) => {
          await tx.exec(`set local role ${sub ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub || ""]);
          await handleRest(req, url, body, res, tx);
        });
      } catch (e) {
        if (process.env.DEV_LOG) console.log("  error", e.message);
        if (!res.headersSent) send(res, /permission denied|row-level/.test(e.message) ? 403 : 400, { code: e.code || "P0001", message: e.message, details: e.detail || null, hint: null });
      } finally { if (process.env.DEV_LOG) console.log("  ", Date.now() - t0, "ms"); }
    });
    return;
  }
  const file = normalize(join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
  if (!file.startsWith(normalize(ROOT)) || !existsSync(file) || /[\\/](tests|supabase|node_modules)[\\/]/.test(file.slice(ROOT.length - 1))) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(file));
}).listen(PORT, "127.0.0.1", async () => {
  // Datos ficticios SOLO para este servidor local.
  const admin = await signUp(ADMIN.email, ADMIN.password, { full_name: "Admin Prueba" });
  await db.query("update profiles set role='admin' where id=$1", [admin.id]);
  await db.exec(`
    insert into service_categories (name, sort_order) values ('Cortes (prueba)', 1), ('Barba (prueba)', 2);
    insert into services (category_id, name, description, duration_min, price, sort_order)
      select id, 'Corte clásico (prueba)', 'Servicio ficticio para probar la interfaz.', 30, 30000, 1 from service_categories where name='Cortes (prueba)';
    insert into services (category_id, name, description, duration_min, price, sort_order)
      select id, 'Corte + diseño (prueba)', 'Precio sin definir a propósito.', 30, null, 2 from service_categories where name='Cortes (prueba)';
    insert into services (category_id, name, duration_min, price, sort_order)
      select id, 'Perfilado de barba (prueba)', 30, 15000, 3 from service_categories where name='Barba (prueba)';
    insert into barbers (name, specialties, sort_order) values ('Barbero A (prueba)', '{fade,barba}', 1), ('Barbero B (prueba)', '{diseño}', 2);
    insert into schedules (barber_id, weekday, start_time, end_time) select null, g, '09:00', '19:00' from generate_series(1,6) g;
    insert into schedules (barber_id, weekday, start_time, end_time) select b.id, g, t.s, t.e from barbers b, generate_series(1,5) g,
      (values ('09:00'::time,'13:00'::time), ('14:00','19:00')) t(s,e) where b.name='Barbero B (prueba)';
  `);
  console.log(`Servidor de desarrollo: http://127.0.0.1:${PORT}  ·  admin local: ${ADMIN.email} (contraseña en este archivo)`);
});
