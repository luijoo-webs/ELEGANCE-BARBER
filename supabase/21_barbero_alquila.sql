-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Barbero que alquila el puesto: sus cortes NO entran en las finanzas
-- de la barbería; quedan aparte en "barber_income" y él los ve en su panel (Ventas → Mis ingresos).
-- Los productos del inventario que venda siguen siendo de la barbería (entran en finanzas).
-- Re-ejecutable. No borra datos.
-- =====================================================================

alter table public.barbers add column if not exists rents_chair boolean not null default false;

create table if not exists public.barber_income (
  id             uuid primary key default gen_random_uuid(),
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  description    text not null check (char_length(description) between 1 and 200),
  amount         numeric(12,2) not null check (amount > 0),
  entry_date     date not null,
  method         text check (char_length(method) <= 40),
  notes          text check (char_length(notes) <= 1000),
  auto           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists barber_income_barber_date on public.barber_income (barber_id, entry_date);
alter table public.barber_income enable row level security;
revoke all on public.barber_income from anon;
grant select on public.barber_income to authenticated;
drop policy if exists barber_income_read on public.barber_income;
create policy barber_income_read on public.barber_income for select to authenticated
  using (is_admin() or barber_id = my_barber_id());   -- solo se escribe desde las funciones del servidor

-- Completar una cita: si su barbero alquila, el servicio va a SUS ingresos; los adicionales (productos) a la barbería.
create or replace function public._appt_income() returns trigger language plpgsql security definer set search_path = public as $$
declare v_day date := (new.starts_at at time zone 'America/Bogota')::date; v_x numeric; v_txt text;
  v_rent boolean := exists (select 1 from barbers where id = new.barber_id and rents_chair);
begin
  if new.status = 'completada' and old.status <> 'completada' then
    if coalesce(new.price, 0) > 0 then
      if v_rent then
        insert into barber_income (barber_id, appointment_id, description, amount, entry_date, method, auto)
        values (new.barber_id, new.id, left('Cita: ' || new.service_name || ' — ' || new.client_name, 200), new.price, v_day, new.payment_method, true);
      else
        insert into finance_entries (kind, description, category, amount, entry_date, method, appointment_id, auto)
        values ('ingreso', left('Cita: ' || new.service_name || ' — ' || new.client_name, 200), 'Servicios', new.price, v_day, new.payment_method, new.id, true);
      end if;
    end if;
    select sum((e->>'q')::numeric * (e->>'p')::numeric), string_agg((e->>'q') || '× ' || (e->>'n'), ', ')
      into v_x, v_txt from jsonb_array_elements(coalesce(new.extras, '[]'::jsonb)) e;
    if coalesce(v_x, 0) > 0 then
      insert into finance_entries (kind, description, category, amount, entry_date, method, appointment_id, auto)
      values ('ingreso', left('Adicionales: ' || v_txt, 200), 'Venta de productos', v_x, v_day, new.payment_method, new.id, true);
    end if;
  elsif old.status = 'completada' and new.status <> 'completada' then
    delete from finance_entries where appointment_id = new.id and auto;
    delete from barber_income where appointment_id = new.id and auto;
  end if;
  return null;
end $$;

-- Venta en caja: igual que en 17, pero los servicios de un barbero que alquila van a sus ingresos.
create or replace function public.admin_sale(p_lines jsonb, p_method text, p_day date, p_barber text default null, p_client text default null, p_email text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e jsonb; v_prods jsonb; v_notes text; v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_client text := nullif(trim(coalesce(p_client, '')), '');
  v_today date := (now() at time zone 'America/Bogota')::date; v_inv invoices; v_total numeric := 0; v_rent uuid;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 or p_day is null or p_day > v_today then raise exception 'VENTA_INVALIDA'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'CORREO_INVALIDO'; end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(e->'n') <> 'string' or length(e->>'n') not between 1 and 80
       or jsonb_typeof(e->'q') <> 'number' or (e->>'q')::numeric not between 1 and 999 or (e->>'q')::numeric <> trunc((e->>'q')::numeric)
       or jsonb_typeof(e->'p') <> 'number' or (e->>'p')::numeric <= 0 then
      raise exception 'VENTA_INVALIDA';
    end if;
    v_total := v_total + (e->>'q')::numeric * (e->>'p')::numeric;
  end loop;

  -- Quién atendió: el barbero que vende desde su panel, o el que se eligió en "Atendió".
  v_rent := coalesce((select b.id from barbers b where b.id = my_barber_id() and b.rents_chair),
                     (select b.id from barbers b where b.rents_chair and b.deleted_at is null and b.name = trim(coalesce(p_barber, '')) limit 1));
  v_notes := nullif(concat_ws(' · ', nullif(trim(coalesce(p_barber, '')), ''), v_client), '');
  if v_rent is not null then
    insert into barber_income (barber_id, description, amount, entry_date, method, notes)
    select v_rent, left('Venta: ' || (x->>'n') || case when (x->>'q')::numeric > 1 then ' ×' || (x->>'q') else '' end, 200), (x->>'q')::numeric * (x->>'p')::numeric, p_day, p_method, v_client
      from jsonb_array_elements(p_lines) x where (x->>'svc')::boolean is true;
  else
    insert into finance_entries (kind, description, category, amount, entry_date, method, notes)
    select 'ingreso', left('Venta: ' || (x->>'n') || case when (x->>'q')::numeric > 1 then ' ×' || (x->>'q') else '' end, 200), 'Servicios', (x->>'q')::numeric * (x->>'p')::numeric, p_day, p_method, v_notes
      from jsonb_array_elements(p_lines) x where (x->>'svc')::boolean is true;
  end if;
  select jsonb_agg(x) into v_prods from jsonb_array_elements(p_lines) x where (x->>'svc')::boolean is not true;
  if v_prods is not null then
    insert into finance_entries (kind, description, category, amount, entry_date, method, notes)
    select 'ingreso', left('Venta adicionales: ' || string_agg((x->>'q') || '× ' || (x->>'n'), ', '), 200), 'Venta de productos', sum((x->>'q')::numeric * (x->>'p')::numeric), p_day, p_method, v_notes
      from jsonb_array_elements(v_prods) x;
    perform _stock_move(v_prods, -1);
  end if;

  insert into invoices (client_name, client_email, barber_name, items, total, method, issued_at)
  values (v_client, v_email, nullif(trim(coalesce(p_barber, '')), ''),
          (select jsonb_agg(jsonb_build_object('n', x->>'n', 'q', (x->>'q')::numeric, 'p', (x->>'p')::numeric)) from jsonb_array_elements(p_lines) x),
          v_total, p_method, case when p_day = v_today then now() else (p_day + time '12:00') at time zone 'America/Bogota' end)
  returning * into v_inv;
  return jsonb_build_object('id', v_inv.id, 'number', v_inv.number, 'total', v_inv.total);
end $$;
revoke all on function public.admin_sale(jsonb, text, date, text, text, text) from public, anon;
grant execute on function public.admin_sale(jsonb, text, date, text, text, text) to authenticated;

-- Resumen del dueño: el "valor de servicios completados" no cuenta los de barberos que alquilan.
create or replace function public.admin_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'America/Bogota')::date; res jsonb;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'RANGO_INVALIDO'; end if;
  with a as (
    select * from appointments
    where (starts_at at time zone 'America/Bogota')::date between p_from and p_to
  ), own as (
    select * from a where not exists (select 1 from barbers b where b.id = a.barber_id and b.rents_chair)
  )
  select jsonb_build_object(
    'hoy',            (select count(*) from appointments where status not in ('cancelada','no_asistio')
                         and (starts_at at time zone 'America/Bogota')::date = v_today),
    'pendientes',     (select count(*) from appointments where status = 'pendiente' and starts_at > now()),
    'total',          (select count(*) from a),
    'confirmadas',    (select count(*) from a where status in ('confirmada','en_proceso')),
    'no_asistio',     (select count(*) from a where status = 'no_asistio'),
    'canceladas',     (select count(*) from a where status = 'cancelada'),
    'completadas',    (select count(*) from a where status = 'completada'),
    'pendientes_periodo', (select count(*) from a where status = 'pendiente'),
    'clientes',       (select count(*) from profiles where role = 'client'),
    'clientes_nuevos',(select count(*) from profiles where role = 'client'
                         and (created_at at time zone 'America/Bogota')::date between p_from and p_to),
    'valor_completadas', (select sum(price) from own where status = 'completada'),
    'completadas_sin_precio', (select count(*) from own where status = 'completada' and price is null),
    'por_servicio', (select coalesce(jsonb_agg(x), '[]') from (
                       select coalesce(e->>'n', a.service_name) as nombre, count(*) as n from a left join lateral jsonb_array_elements(a.services) e on true
                       where status not in ('cancelada','no_asistio') group by 1 order by n desc limit 6) x),
    'por_barbero',  (select coalesce(jsonb_agg(x), '[]') from (
                       select barber_name as nombre, count(*) as n from a where status not in ('cancelada','no_asistio')
                       group by barber_name order by n desc limit 6) x),
    'por_dia',      (select coalesce(jsonb_agg(x order by x.dia), '[]') from (
                       select d::date as dia,
                              (select count(*) from a where status not in ('cancelada','no_asistio')
                                 and (starts_at at time zone 'America/Bogota')::date = d::date) as n
                       from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d) x)
  ) into res;
  return res;
end $$;
