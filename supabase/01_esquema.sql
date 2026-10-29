-- =====================================================================
-- ELEGANCE BARBER — Esquema completo (Supabase / PostgreSQL 15+)
--
-- Ejecutar en Supabase → SQL Editor (todo el archivo, una vez).
-- Es re-ejecutable: no borra datos (create if not exists / create or replace).
--
-- Reglas clave:
--  · Zona horaria del negocio: America/Bogota (sin horario de verano).
--  · Una cita ocupa [starts_at, ends_at). Bloquean horario los estados
--    pendiente (mientras no expire), confirmada y completada. Cancelada NO.
--  · La restricción EXCLUDE appointments_no_overlap impide, de forma atómica,
--    dos citas solapadas del mismo barbero aunque lleguen al mismo tiempo.
--  · Los clientes no escriben en appointments directamente: solo vía RPC.
--  · El rol se asigna en el servidor; el registro público siempre crea 'client'.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Configuración del negocio (clave → JSON). Lectura pública, escritura admin.
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.service_categories(id) on delete set null,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (char_length(description) <= 600),
  duration_min int  not null check (duration_min between 5 and 480),
  price        numeric(12,2) check (price is null or price >= 0),   -- null = precio por definir
  image_url    text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  deleted_at   timestamptz,                                           -- borrado lógico
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.barbers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  bio         text check (char_length(bio) <= 600),
  specialties text[] not null default '{}',
  photo_url   text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 120),
  email      text,
  phone      text check (char_length(phone) <= 30),
  role       text not null default 'client' check (role in ('client','admin','barber')),
  barber_id  uuid references public.barbers(id) on delete set null,   -- solo para rol barber
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Notas internas sobre clientes: solo administradores.
create table if not exists public.client_admin_notes (
  client_id  uuid primary key references public.profiles(id) on delete cascade,
  notes      text not null default '' check (char_length(notes) <= 2000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Horario semanal. barber_id null = horario general del negocio.
-- Varias franjas el mismo día = el espacio entre ellas es una pausa.
-- Un barbero sin ninguna franja propia trabaja el horario general.
create table if not exists public.schedules (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid references public.barbers(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),          -- 0 = domingo
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);

-- Cierres, festivos, vacaciones y bloqueos manuales. barber_id null = todo el negocio.
create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid references public.barbers(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  kind       text not null default 'bloqueo' check (kind in ('cierre','festivo','vacaciones','bloqueo')),
  reason     text check (char_length(reason) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.gallery (
  id         uuid primary key default gen_random_uuid(),
  image_url  text not null,
  caption    text check (char_length(caption) <= 140),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references public.profiles(id) on delete set null,
  client_name        text not null default '',
  client_phone       text,
  client_email       text,
  barber_id          uuid not null references public.barbers(id),
  barber_name        text not null default '',
  service_id         uuid references public.services(id),
  service_name       text not null,               -- copia al reservar
  duration_min       int  not null check (duration_min between 5 and 480),
  price              numeric(12,2),                -- precio vigente al reservar (null si no estaba definido)
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             text not null default 'confirmada'
                     check (status in ('pendiente','confirmada','cancelada','completada')),
  pending_expires_at timestamptz,
  client_notes       text check (char_length(client_notes) <= 500),
  admin_notes        text check (char_length(admin_notes) <= 2000),
  cancel_reason      text,
  cancelled_by       uuid,
  cancelled_at       timestamptz,
  source             text not null default 'web' check (source in ('web','admin')),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint appointments_no_overlap exclude using gist (
    barber_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pendiente','confirmada','completada'))
);

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb
);

create index if not exists appointments_barber_start on public.appointments (barber_id, starts_at);
create index if not exists appointments_client_start on public.appointments (client_id, starts_at);
create index if not exists appointments_start on public.appointments (starts_at);
create index if not exists appointments_status on public.appointments (status);
create index if not exists schedules_barber_day on public.schedules (barber_id, weekday);
create index if not exists time_off_range on public.time_off using gist (tstzrange(starts_at, ends_at));
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists services_category on public.services (category_id);
create index if not exists profiles_barber on public.profiles (barber_id);

-- ---------------------------------------------------------------------
-- 2. CONFIGURACIÓN INICIAL (solo datos reales; lo demás queda vacío)
--    Fuente: Instagram @elegancebarberr. Editar todo en Admin → Configuración.
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
('negocio', jsonb_build_object(
  'nombre', 'Elegance Barber',
  'nombre_largo', 'The Elegance Of The Barber''s',
  'eslogan', 'Tu mejor opción.',
  'direccion', 'Calle 19 C1 #13B-54, frente a la cancha de Las Flores',
  'ciudad', '',
  'mapa_url', '',
  'telefono', '',
  'whatsapp_url', 'https://wa.me/message/LSU2MF6F7NIHM1',
  'correo', '',
  'instagram', 'https://www.instagram.com/elegancebarberr/',
  'facebook', '',
  'tiktok', '',
  'filosofia', '',
  'hero_titulo', '',
  'hero_texto', '',
  'hero_imagen', '',
  'about_imagen', '',
  'logo_url', '',
  'color_acento', '#141312'
)),
-- Reglas operativas por defecto: revísalas en Admin → Configuración → Reservas.
('reservas', jsonb_build_object(
  'intervalo_min', 15,               -- cada cuántos minutos se ofrece una hora de inicio
  'anticipacion_min_minutos', 60,    -- no se reserva con menos de 1 h
  'anticipacion_max_dias', 30,       -- hasta 30 días en el futuro
  'confirmacion_automatica', true,   -- false = quedan "pendiente" hasta que el admin confirme
  'pendiente_horas', 12,             -- una pendiente sin confirmar se libera tras estas horas
  'cancelacion_min_horas', 2,        -- el cliente puede cancelar/reprogramar hasta 2 h antes
  'reprogramacion_permitida', true,
  'max_reservas_activas', 3,         -- citas futuras simultáneas por cliente
  'cualquier_barbero', true
))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_barber_id() returns uuid
language sql stable security definer set search_path = public as $$
  select barber_id from profiles where id = auth.uid() and role = 'barber';
$$;

create or replace function public._cfg(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from settings where key = k), '{}'::jsonb);
$$;

create or replace function public._touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Registro de auditoría: quién cambió qué y cuándo (solo campos modificados en UPDATE).
create or replace function public._audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old)); d jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)) into d
    from jsonb_each(to_jsonb(old)) o join jsonb_each(to_jsonb(new)) n on n.key = o.key
    where o.value is distinct from n.value and o.key <> 'updated_at';
    if d is null then return new; end if;
  else
    d := r;
  end if;
  insert into audit_log (actor, actor_email, action, entity, entity_id, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), lower(tg_op), tg_table_name,
          coalesce(r->>'id', r->>'key', r->>'client_id'), d);
  return coalesce(new, old);
end $$;

-- Perfil automático al registrarse. El rol SIEMPRE es 'client' (se ignora cualquier metadata).
create or replace function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120),
          left(nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''), 30))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public._sync_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

-- Un no-admin solo puede cambiar nombre y teléfono de su propio perfil.
create or replace function public._profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role       := old.role;
    new.barber_id  := old.barber_id;
    new.created_at := old.created_at;
    new.email      := (select email from auth.users where id = old.id);
  end if;
  if new.role <> 'barber' then new.barber_id := null; end if;
  return new;
end $$;

-- Libera las reservas pendientes cuyo plazo de confirmación venció.
create or replace function public._expire_pending() returns void
language sql security definer set search_path = public as $$
  update appointments
     set status = 'cancelada', cancel_reason = 'Expiró sin confirmación', cancelled_at = now()
   where status = 'pendiente' and pending_expires_at is not null and pending_expires_at <= now();
$$;

-- Devuelve null si el intervalo es reservable para el barbero, o un código de error.
-- Valida: barbero activo, horario del negocio, horario propio del barbero,
-- cierres/bloqueos y citas existentes (p_ignore = la cita que se está moviendo).
create or replace function public._slot_problem(p_barber uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_ls  timestamp := p_start at time zone 'America/Bogota';
  v_le  timestamp := p_end   at time zone 'America/Bogota';
  v_day date      := (p_start at time zone 'America/Bogota')::date;
  v_dow int       := extract(dow from (p_start at time zone 'America/Bogota'));
begin
  if not exists (select 1 from barbers where id = p_barber and active and deleted_at is null) then
    return 'BARBERO_NO_DISPONIBLE';
  end if;
  if not exists (select 1 from schedules s where s.barber_id is null and s.weekday = v_dow
                 and v_day + s.start_time <= v_ls and v_day + s.end_time >= v_le) then
    return 'FUERA_DE_HORARIO';
  end if;
  if exists (select 1 from schedules where barber_id = p_barber)
     and not exists (select 1 from schedules s where s.barber_id = p_barber and s.weekday = v_dow
                     and v_day + s.start_time <= v_ls and v_day + s.end_time >= v_le) then
    return 'FUERA_DE_HORARIO';
  end if;
  if exists (select 1 from time_off t where (t.barber_id is null or t.barber_id = p_barber)
             and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_start, p_end)) then
    return 'HORARIO_BLOQUEADO';
  end if;
  if exists (select 1 from appointments a
             where a.barber_id = p_barber and a.id is distinct from p_ignore
               and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end)
               and (a.status in ('confirmada','completada')
                    or (a.status = 'pendiente' and (a.pending_expires_at is null or a.pending_expires_at > now())))) then
    return 'HORARIO_OCUPADO';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 4. DISPONIBILIDAD (pública: solo devuelve horas libres, ningún dato de clientes)
-- ---------------------------------------------------------------------
create or replace function public.get_availability(p_service uuid, p_barber uuid, p_from date, p_days int default 7)
returns table (barber_id uuid, slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  r     jsonb := _cfg('reservas');
  v_dur int;
  v_step int := greatest(5, coalesce((r->>'intervalo_min')::int, 15));
  v_min timestamptz := now() + make_interval(mins => coalesce((r->>'anticipacion_min_minutos')::int, 60));
  v_max date := (now() at time zone 'America/Bogota')::date + coalesce((r->>'anticipacion_max_dias')::int, 30);
begin
  select s.duration_min into v_dur from services s where s.id = p_service and s.active and s.deleted_at is null;
  if v_dur is null then return; end if;
  p_days := least(greatest(coalesce(p_days, 7), 1), 42);
  return query
  select x.bid, x.ts from (
    select distinct b.id as bid, c.ts, b.sort_order
    from barbers b
    cross join lateral (
      select ((d::date + s.start_time) + make_interval(mins => v_step * k)) at time zone 'America/Bogota' as ts
      from generate_series(p_from::timestamp, (p_from + p_days - 1)::timestamp, interval '1 day') d
      join schedules s on s.barber_id is null and s.weekday = extract(dow from d)
      cross join generate_series(0, floor((extract(epoch from (s.end_time - s.start_time)) / 60 - v_dur) / v_step)::int) k
      where d::date <= v_max
    ) c
    where b.active and b.deleted_at is null and (p_barber is null or b.id = p_barber)
      and c.ts >= v_min
      and _slot_problem(b.id, c.ts, c.ts + make_interval(mins => v_dur)) is null
  ) x
  order by x.ts, x.sort_order;
end $$;

-- ---------------------------------------------------------------------
-- 5. RESERVAS DEL CLIENTE
-- ---------------------------------------------------------------------
create or replace function public.book_appointment(p_service uuid, p_barber uuid, p_start timestamptz, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  r      jsonb := _cfg('reservas');
  v_prof profiles;
  v_svc  services;
  v_end  timestamptz;
  v_bid  uuid;
  v_bname text;
  v_id   uuid;
  v_problem text;
  v_status text := case when coalesce((r->>'confirmacion_automatica')::boolean, true) then 'confirmada' else 'pendiente' end;
begin
  if v_uid is null then raise exception 'NO_AUTENTICADO'; end if;
  select * into v_prof from profiles where id = v_uid;
  select * into v_svc from services where id = p_service and active and deleted_at is null;
  if v_svc.id is null then raise exception 'SERVICIO_NO_DISPONIBLE'; end if;
  if p_start < now() + make_interval(mins => coalesce((r->>'anticipacion_min_minutos')::int, 60)) then
    raise exception 'ANTICIPACION_MINIMA';
  end if;
  if (p_start at time zone 'America/Bogota')::date
     > (now() at time zone 'America/Bogota')::date + coalesce((r->>'anticipacion_max_dias')::int, 30) then
    raise exception 'FUERA_DE_RANGO';
  end if;
  if p_barber is null and not coalesce((r->>'cualquier_barbero')::boolean, true) then
    raise exception 'ELIGE_BARBERO';
  end if;
  if (select count(*) from appointments where client_id = v_uid and status in ('pendiente','confirmada') and starts_at > now())
     >= coalesce((r->>'max_reservas_activas')::int, 3) then
    raise exception 'LIMITE_RESERVAS';
  end if;

  perform _expire_pending();
  v_end := p_start + make_interval(mins => v_svc.duration_min);

  -- "Cualquier barbero": se prueba primero el que tenga menos citas ese día.
  for v_bid, v_bname in
    select b.id, b.name from barbers b
    where b.active and b.deleted_at is null and (p_barber is null or b.id = p_barber)
    order by (select count(*) from appointments a where a.barber_id = b.id and a.status <> 'cancelada'
              and (a.starts_at at time zone 'America/Bogota')::date = (p_start at time zone 'America/Bogota')::date),
             b.sort_order
  loop
    v_problem := _slot_problem(v_bid, p_start, v_end);
    continue when v_problem is not null;
    begin
      insert into appointments (client_id, client_name, client_phone, client_email, barber_id, barber_name,
                                service_id, service_name, duration_min, price, starts_at, ends_at, status,
                                pending_expires_at, client_notes, source, created_by)
      values (v_uid, coalesce(v_prof.full_name, ''), v_prof.phone, v_prof.email, v_bid, v_bname,
              v_svc.id, v_svc.name, v_svc.duration_min, v_svc.price, p_start, v_end, v_status,
              case when v_status = 'pendiente'
                   then least(now() + make_interval(hours => coalesce((r->>'pendiente_horas')::int, 12)), p_start) end,
              left(nullif(trim(p_notes), ''), 500), 'web', v_uid)
      returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      v_problem := 'HORARIO_OCUPADO';   -- otra reserva ganó la carrera: probar el siguiente barbero
    end;
  end loop;
  raise exception '%', case when p_barber is null then 'HORARIO_OCUPADO' else coalesce(v_problem, 'BARBERO_NO_DISPONIBLE') end;
end $$;

create or replace function public.cancel_my_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a appointments; r jsonb := _cfg('reservas');
begin
  select * into a from appointments where id = p_id and client_id = auth.uid() for update;
  if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if a.status not in ('pendiente','confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if a.starts_at < now() + make_interval(hours => coalesce((r->>'cancelacion_min_horas')::int, 2)) then
    raise exception 'FUERA_DE_PLAZO';
  end if;
  update appointments
     set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = left(coalesce(nullif(trim(p_reason), ''), 'Cancelada por el cliente'), 300)
   where id = p_id;
end $$;

-- Reprograma una cita propia (mismo servicio). p_barber null = mantener barbero.
create or replace function public.reschedule_my_appointment(p_id uuid, p_start timestamptz, p_barber uuid default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a appointments; r jsonb := _cfg('reservas'); v_bid uuid; v_end timestamptz; v_problem text;
begin
  select * into a from appointments where id = p_id and client_id = auth.uid() for update;
  if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if not coalesce((r->>'reprogramacion_permitida')::boolean, true) then raise exception 'REPROGRAMACION_DESACTIVADA'; end if;
  if a.status not in ('pendiente','confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if a.starts_at < now() + make_interval(hours => coalesce((r->>'cancelacion_min_horas')::int, 2)) then
    raise exception 'FUERA_DE_PLAZO';
  end if;
  if p_start < now() + make_interval(mins => coalesce((r->>'anticipacion_min_minutos')::int, 60)) then
    raise exception 'ANTICIPACION_MINIMA';
  end if;
  if (p_start at time zone 'America/Bogota')::date
     > (now() at time zone 'America/Bogota')::date + coalesce((r->>'anticipacion_max_dias')::int, 30) then
    raise exception 'FUERA_DE_RANGO';
  end if;
  perform _expire_pending();
  v_bid := coalesce(p_barber, a.barber_id);
  v_end := p_start + make_interval(mins => a.duration_min);
  v_problem := _slot_problem(v_bid, p_start, v_end, a.id);
  if v_problem is not null then raise exception '%', v_problem; end if;
  begin
    update appointments
       set starts_at = p_start, ends_at = v_end, barber_id = v_bid,
           barber_name = (select name from barbers where id = v_bid),
           pending_expires_at = case when status = 'pendiente'
             then least(now() + make_interval(hours => coalesce((r->>'pendiente_horas')::int, 12)), p_start) end
     where id = a.id;
  exception when exclusion_violation then raise exception 'HORARIO_OCUPADO';
  end;
end $$;

-- ---------------------------------------------------------------------
-- 6. OPERACIONES DE ADMINISTRADOR (validan permisos en el servidor)
-- ---------------------------------------------------------------------

-- Crea (p_id null) o modifica/reprograma una cita. Nunca permite solapamientos
-- ni horas fuera de horario/bloqueadas; sí omite las reglas de anticipación del cliente.
create or replace function public.admin_save_appointment(
  p_id uuid, p_client_id uuid, p_client_name text, p_client_phone text,
  p_service uuid, p_barber uuid, p_start timestamptz, p_admin_notes text default null, p_status text default 'confirmada')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare a appointments; v_svc services; v_prof profiles; v_end timestamptz; v_problem text; v_id uuid;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into v_svc from services where id = p_service and deleted_at is null;
  if v_svc.id is null then raise exception 'SERVICIO_NO_DISPONIBLE'; end if;
  if p_start < now() - interval '5 minutes' then raise exception 'HORARIO_PASADO'; end if;
  if p_status not in ('pendiente','confirmada') then raise exception 'ESTADO_INVALIDO'; end if;
  perform _expire_pending();
  v_end := p_start + make_interval(mins => v_svc.duration_min);

  if p_id is not null then
    select * into a from appointments where id = p_id for update;
    if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
    if a.status not in ('pendiente','confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
    -- Si el servicio no cambia se conserva la duración y el precio originales.
    if a.service_id is not distinct from p_service then v_end := p_start + make_interval(mins => a.duration_min); end if;
  end if;

  v_problem := _slot_problem(p_barber, p_start, v_end, p_id);
  if v_problem is not null then raise exception '%', v_problem; end if;

  begin
    if p_id is null then
      if p_client_id is not null then select * into v_prof from profiles where id = p_client_id; end if;
      if coalesce(nullif(trim(coalesce(v_prof.full_name, p_client_name)), ''), '') = '' then raise exception 'CLIENTE_REQUERIDO'; end if;
      insert into appointments (client_id, client_name, client_phone, client_email, barber_id, barber_name,
                                service_id, service_name, duration_min, price, starts_at, ends_at, status,
                                admin_notes, source, created_by)
      values (v_prof.id, left(trim(coalesce(nullif(v_prof.full_name, ''), p_client_name)), 120),
              left(coalesce(nullif(trim(p_client_phone), ''), v_prof.phone), 30), v_prof.email,
              p_barber, (select name from barbers where id = p_barber),
              v_svc.id, v_svc.name, v_svc.duration_min, v_svc.price, p_start, v_end, p_status,
              nullif(trim(p_admin_notes), ''), 'admin', auth.uid())
      returning id into v_id;
    else
      update appointments
         set barber_id = p_barber, barber_name = (select name from barbers where id = p_barber),
             starts_at = p_start, ends_at = v_end,
             service_id = v_svc.id,
             service_name = case when a.service_id is not distinct from p_service then a.service_name else v_svc.name end,
             duration_min = case when a.service_id is not distinct from p_service then a.duration_min else v_svc.duration_min end,
             price        = case when a.service_id is not distinct from p_service then a.price else v_svc.price end,
             client_phone = coalesce(nullif(trim(p_client_phone), ''), client_phone),
             admin_notes  = nullif(trim(p_admin_notes), ''),
             status = p_status,
             pending_expires_at = case when p_status = 'pendiente' then pending_expires_at end
       where id = p_id
      returning id into v_id;
    end if;
  exception when exclusion_violation then raise exception 'HORARIO_OCUPADO';
  end;
  return v_id;
end $$;

-- Transiciones permitidas:
--   pendiente  → confirmada | cancelada
--   confirmada → completada | cancelada | pendiente
--   completada → confirmada (corregir un error)
--   cancelada  → (final; crea una cita nueva)
create or replace function public.admin_set_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a appointments;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into a from appointments where id = p_id for update;
  if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if a.status = p_status then return; end if;
  if not ((a.status = 'pendiente'  and p_status in ('confirmada','cancelada'))
       or (a.status = 'confirmada' and p_status in ('completada','cancelada','pendiente'))
       or (a.status = 'completada' and p_status = 'confirmada')) then
    raise exception 'TRANSICION_INVALIDA';
  end if;
  if p_status = 'completada' and a.starts_at > now() then raise exception 'CITA_FUTURA'; end if;
  update appointments
     set status = p_status,
         pending_expires_at = null,
         cancel_reason = case when p_status = 'cancelada' then left(coalesce(nullif(trim(p_reason), ''), 'Cancelada por la barbería'), 300) end,
         cancelled_at  = case when p_status = 'cancelada' then now() end,
         cancelled_by  = case when p_status = 'cancelada' then auth.uid() end
   where id = p_id;
end $$;

create or replace function public.admin_set_notes(p_id uuid, p_notes text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update appointments set admin_notes = left(nullif(trim(p_notes), ''), 2000) where id = p_id;
end $$;

-- Indicadores del panel. "valor_completadas" suma el precio registrado de citas
-- completadas: es una estimación, NO un registro de pagos.
create or replace function public.admin_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'America/Bogota')::date; res jsonb;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'RANGO_INVALIDO'; end if;
  with a as (
    select * from appointments
    where (starts_at at time zone 'America/Bogota')::date between p_from and p_to
  )
  select jsonb_build_object(
    'hoy',            (select count(*) from appointments where status <> 'cancelada'
                         and (starts_at at time zone 'America/Bogota')::date = v_today),
    'pendientes',     (select count(*) from appointments where status = 'pendiente' and starts_at > now()),
    'total',          (select count(*) from a),
    'confirmadas',    (select count(*) from a where status = 'confirmada'),
    'canceladas',     (select count(*) from a where status = 'cancelada'),
    'completadas',    (select count(*) from a where status = 'completada'),
    'pendientes_periodo', (select count(*) from a where status = 'pendiente'),
    'clientes',       (select count(*) from profiles where role = 'client'),
    'clientes_nuevos',(select count(*) from profiles where role = 'client'
                         and (created_at at time zone 'America/Bogota')::date between p_from and p_to),
    'valor_completadas', (select sum(price) from a where status = 'completada'),
    'completadas_sin_precio', (select count(*) from a where status = 'completada' and price is null),
    'por_servicio', (select coalesce(jsonb_agg(x), '[]') from (
                       select service_name as nombre, count(*) as n from a where status <> 'cancelada'
                       group by service_name order by n desc limit 6) x),
    'por_barbero',  (select coalesce(jsonb_agg(x), '[]') from (
                       select barber_name as nombre, count(*) as n from a where status <> 'cancelada'
                       group by barber_name order by n desc limit 6) x),
    'por_dia',      (select coalesce(jsonb_agg(x order by x.dia), '[]') from (
                       select d::date as dia,
                              (select count(*) from a where status <> 'cancelada'
                                 and (starts_at at time zone 'America/Bogota')::date = d::date) as n
                       from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d) x)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._handle_new_user();
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public._sync_user_email();

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public._profiles_guard();

do $$ declare t text; begin
  foreach t in array array['services','barbers','profiles','appointments'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public._touch()', t);
  end loop;
  foreach t in array array['appointments','services','service_categories','barbers','schedules','time_off','settings','client_admin_notes','gallery'] loop
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public._audit()', t);
  end loop;
end $$;
-- Cambios de rol en perfiles también quedan auditados.
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update of role, barber_id on public.profiles for each row execute function public._audit();

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.settings           enable row level security;
alter table public.service_categories enable row level security;
alter table public.services           enable row level security;
alter table public.barbers            enable row level security;
alter table public.profiles           enable row level security;
alter table public.client_admin_notes enable row level security;
alter table public.schedules          enable row level security;
alter table public.time_off           enable row level security;
alter table public.gallery            enable row level security;
alter table public.appointments       enable row level security;
alter table public.audit_log          enable row level security;

-- settings: lectura pública, escritura admin
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated using (is_admin()) with check (is_admin());

-- catálogo público: solo lo activo; el admin ve y edita todo
drop policy if exists categories_read on public.service_categories;
create policy categories_read on public.service_categories for select using (active or is_admin());
drop policy if exists categories_admin on public.service_categories;
create policy categories_admin on public.service_categories for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists services_read on public.services;
create policy services_read on public.services for select using ((active and deleted_at is null) or is_admin());
drop policy if exists services_admin on public.services;
create policy services_admin on public.services for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists barbers_read on public.barbers;
create policy barbers_read on public.barbers for select using ((active and deleted_at is null) or is_admin() or id = my_barber_id());
drop policy if exists barbers_admin on public.barbers;
create policy barbers_admin on public.barbers for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists gallery_read on public.gallery;
create policy gallery_read on public.gallery for select using (active or is_admin());
drop policy if exists gallery_admin on public.gallery;
create policy gallery_admin on public.gallery for all to authenticated using (is_admin()) with check (is_admin());

-- horarios: públicos (se muestran en la web); escritura admin
drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules for select using (true);
drop policy if exists schedules_admin on public.schedules;
create policy schedules_admin on public.schedules for all to authenticated using (is_admin()) with check (is_admin());

-- bloqueos: el motivo puede ser privado → solo admin y el barbero afectado
drop policy if exists time_off_read on public.time_off;
create policy time_off_read on public.time_off for select to authenticated using (is_admin() or barber_id = my_barber_id());
drop policy if exists time_off_admin on public.time_off;
create policy time_off_admin on public.time_off for all to authenticated using (is_admin()) with check (is_admin());

-- perfiles: cada quien el suyo; admin todos. Inserción solo por trigger.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists client_notes_admin on public.client_admin_notes;
create policy client_notes_admin on public.client_admin_notes for all to authenticated using (is_admin()) with check (is_admin());

-- citas: lectura propia / admin / barbero asignado. Escritura solo por RPC.
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (client_id = auth.uid() or is_admin() or barber_id = my_barber_id());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- 9. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------
revoke all on public.appointments from anon;
revoke insert, update, delete on public.appointments, public.audit_log from authenticated;
revoke all on public.audit_log, public.client_admin_notes, public.time_off from anon;

revoke execute on function public._cfg(text), public._touch(), public._audit(), public._handle_new_user(),
  public._sync_user_email(), public._profiles_guard(), public._expire_pending(),
  public._slot_problem(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.book_appointment(uuid, uuid, timestamptz, text),
  public.cancel_my_appointment(uuid, text), public.reschedule_my_appointment(uuid, timestamptz, uuid),
  public.admin_save_appointment(uuid, uuid, text, text, uuid, uuid, timestamptz, text, text),
  public.admin_set_status(uuid, text, text), public.admin_set_notes(uuid, text),
  public.admin_stats(date, date) from public, anon;

grant execute on function public.get_availability(uuid, uuid, date, int) to anon, authenticated;
grant execute on function public.is_admin(), public.my_barber_id() to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text),
  public.cancel_my_appointment(uuid, text), public.reschedule_my_appointment(uuid, timestamptz, uuid),
  public.admin_save_appointment(uuid, uuid, text, text, uuid, uuid, timestamptz, text, text),
  public.admin_set_status(uuid, text, text), public.admin_set_notes(uuid, text),
  public.admin_stats(date, date) to authenticated;

-- Tiempo real para que la agenda del panel se actualice sola.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
    execute 'alter publication supabase_realtime add table public.appointments';
  end if;
end $$;
