-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Una visita = una cita (35 min por cliente, no por servicio),
-- método de pago e ingresos automáticos al completar una cita.
-- Re-ejecutable. Ejecutar después de 09. Las citas que ya existen no se modifican.
-- =====================================================================
alter table public.appointments add column if not exists services jsonb;         -- [{id,n,p}] si la visita tiene varios servicios
alter table public.appointments add column if not exists payment_method text
  check (payment_method in ('Efectivo','Transferencia','Nequi','Tarjeta'));
alter table public.finance_entries add column if not exists auto boolean not null default false;   -- creado al completar una cita

-- La firma cambia (p_payment): se quita la anterior para que no queden dos versiones. Las citas no se tocan.
drop function if exists public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb);
drop function if exists public.book_cart(uuid[], uuid, timestamptz, text, jsonb);

-- Todos los servicios van en una sola cita; dura lo que dure el servicio más largo.
create or replace function public.book_cart(p_services uuid[], p_barber uuid, p_start timestamptz,
  p_notes text default null, p_extras jsonb default null, p_payment text default null)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare v_n int := coalesce(array_length(p_services, 1), 0); v_found int; v_long uuid; v_names text; v_list jsonb; v_price numeric; aid uuid;
begin
  if v_n not between 1 and 10 then raise exception 'CARRITO_INVALIDO'; end if;
  if p_payment is not null and p_payment not in ('Efectivo','Transferencia','Nequi','Tarjeta') then raise exception 'PAGO_INVALIDO'; end if;
  if p_extras is not null and p_extras <> '[]'::jsonb then perform _check_extras(p_extras); end if;
  select count(*), (array_agg(s.id order by s.duration_min desc, u.ord))[1], string_agg(s.name, ' + ' order by u.ord),
         jsonb_agg(jsonb_build_object('id', s.id, 'n', s.name, 'p', s.price) order by u.ord),
         case when count(s.price) = count(*) then sum(s.price) end
    into v_found, v_long, v_names, v_list, v_price
    from unnest(p_services) with ordinality u(id, ord) join services s on s.id = u.id and s.active and s.deleted_at is null;
  if v_found <> v_n then raise exception 'SERVICIO_NO_DISPONIBLE'; end if;
  aid := book_appointment(v_long, p_barber, p_start, p_notes);
  update appointments set service_name = v_names, price = v_price, services = case when v_n > 1 then v_list end,
         extras = case when p_extras <> '[]'::jsonb then p_extras end, payment_method = p_payment
   where id = aid;
  return array[aid];
end $$;

create or replace function public.book_cart_guest(p_name text, p_phone text, p_email text, p_services uuid[], p_barber uuid,
  p_start timestamptz, p_notes text default null, p_extras jsonb default null, p_payment text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[]; a appointments;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'NOMBRE_INVALIDO'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 7 and 15 then raise exception 'CELULAR_INVALIDO'; end if;
  if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'CORREO_INVALIDO'; end if;
  perform set_config('eb.guest', jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'email', lower(trim(p_email)))::text, true);
  ids := book_cart(p_services, p_barber, p_start, p_notes, p_extras, p_payment);
  perform set_config('eb.guest', '', true);
  select * into a from appointments where id = ids[1];
  return jsonb_build_object('ids', to_jsonb(ids), 'barber', a.barber_name, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status);
end $$;

revoke all on function public.book_cart(uuid[], uuid, timestamptz, text, jsonb, text) from public, anon;
grant execute on function public.book_cart(uuid[], uuid, timestamptz, text, jsonb, text) to authenticated;
revoke all on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) from public;
grant execute on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) to anon, authenticated;

-- Si el admin cambia el servicio de una cita, deja de aplicar la lista de la visita.
create or replace function public._appt_services_reset() returns trigger language plpgsql as $$
begin
  if new.service_id is distinct from old.service_id then new.services := null; end if;
  return new;
end $$;
drop trigger if exists appt_services_reset on public.appointments;
create trigger appt_services_reset before update of service_id on public.appointments
  for each row execute function public._appt_services_reset();

-- Completar una cita registra su ingreso en finanzas; deshacerla lo quita (solo el automático).
create or replace function public._appt_income() returns trigger language plpgsql security definer set search_path = public as $$
declare v_day date := (new.starts_at at time zone 'America/Bogota')::date; v_x numeric; v_txt text;
begin
  if new.status = 'completada' and old.status <> 'completada' then
    if coalesce(new.price, 0) > 0 then
      insert into finance_entries (kind, description, category, amount, entry_date, method, appointment_id, auto)
      values ('ingreso', left('Cita: ' || new.service_name || ' — ' || new.client_name, 200), 'Servicios', new.price, v_day, new.payment_method, new.id, true);
    end if;
    select sum((e->>'q')::numeric * (e->>'p')::numeric), string_agg((e->>'q') || '× ' || (e->>'n'), ', ')
      into v_x, v_txt from jsonb_array_elements(coalesce(new.extras, '[]'::jsonb)) e;
    if coalesce(v_x, 0) > 0 then
      insert into finance_entries (kind, description, category, amount, entry_date, method, appointment_id, auto)
      values ('ingreso', left('Adicionales: ' || v_txt, 200), 'Venta de productos', v_x, v_day, new.payment_method, new.id, true);
    end if;
  elsif old.status = 'completada' and new.status <> 'completada' then
    delete from finance_entries where appointment_id = new.id and auto;
  end if;
  return null;
end $$;
drop trigger if exists appt_income on public.appointments;
create trigger appt_income after update of status on public.appointments
  for each row execute function public._appt_income();

-- admin_stats: igual que en 01, pero "por servicio" cuenta cada servicio de la visita.
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
                       select coalesce(e->>'n', a.service_name) as nombre, count(*) as n from a left join lateral jsonb_array_elements(a.services) e on true
                       where status <> 'cancelada' group by 1 order by n desc limit 6) x),
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
