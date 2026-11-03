-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Carrito sin tope de 3 servicios, y correos de reserva y recordatorio.
-- Re-ejecutable. Ejecutar después de 06.
-- =====================================================================

-- 1. Las citas de un mismo carrito comparten cart_id ---------------------------
alter table public.appointments add column if not exists cart_id uuid;
create index if not exists appointments_cart_idx on public.appointments (cart_id) where cart_id is not null;

-- book_appointment: igual que en 01, pero el límite de reservas activas cuenta visitas (carritos), no servicios.
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
  v_cart uuid := nullif(current_setting('eb.cart', true), '')::uuid;   -- lo pone book_cart
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
  -- Una visita del carrito (varios servicios seguidos) cuenta como una sola reserva.
  if (select count(distinct coalesce(cart_id, id)) from appointments where client_id = v_uid and status in ('pendiente','confirmada') and starts_at > now()
        and (v_cart is null or cart_id is distinct from v_cart))
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
                                pending_expires_at, client_notes, source, created_by, cart_id)
      values (v_uid, coalesce(v_prof.full_name, ''), v_prof.phone, v_prof.email, v_bid, v_bname,
              v_svc.id, v_svc.name, v_svc.duration_min, v_svc.price, p_start, v_end, v_status,
              case when v_status = 'pendiente'
                   then least(now() + make_interval(hours => coalesce((r->>'pendiente_horas')::int, 12)), p_start) end,
              left(nullif(trim(p_notes), ''), 500), 'web', v_uid, v_cart)
      returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      v_problem := 'HORARIO_OCUPADO';   -- otra reserva ganó la carrera: probar el siguiente barbero
    end;
  end loop;
  raise exception '%', case when p_barber is null then 'HORARIO_OCUPADO' else coalesce(v_problem, 'BARBERO_NO_DISPONIBLE') end;
end $$;

create or replace function public.book_cart(p_services uuid[], p_barber uuid, p_start timestamptz,
  p_notes text default null, p_extras jsonb default null)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := '{}'; t timestamptz := p_start; b uuid := p_barber; aid uuid; i int;
begin
  if p_services is null or coalesce(array_length(p_services, 1), 0) not between 1 and 10 then raise exception 'CARRITO_INVALIDO'; end if;
  perform set_config('eb.cart', gen_random_uuid()::text, true);   -- solo dura esta transacción
  for i in 1 .. array_length(p_services, 1) loop
    aid := book_appointment(p_services[i], b, t, case when i = 1 then p_notes end);
    select barber_id, ends_at into b, t from appointments where id = aid;
    ids := ids || aid;
  end loop;
  perform set_config('eb.cart', '', true);
  if p_extras is not null and jsonb_typeof(p_extras) = 'array' and jsonb_array_length(p_extras) > 0 then
    perform set_appointment_extras(ids[1], p_extras);
  end if;
  return ids;
end $$;

-- 2. Correos: confirmación de la reserva y recordatorio 2 horas antes ---------
-- Las columnas nacen con la fecha actual en las citas que ya existían (no se les manda correo viejo).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'confirm_sent_at') then
    alter table public.appointments add column confirm_sent_at timestamptz default now(), add column reminder_sent_at timestamptz default now();
    alter table public.appointments alter column confirm_sent_at drop default, alter column reminder_sent_at drop default;
  end if;
end $$;

-- La función de correos (servidor, service_role) "reclama" lo pendiente para no mandar dos veces.
create or replace function public.claim_confirmations()
returns setof appointments language sql volatile security definer set search_path = public as $$
  update appointments set confirm_sent_at = now()
   where confirm_sent_at is null and client_email is not null and status in ('pendiente','confirmada')
     and created_at > now() - interval '1 day' and starts_at > now()
  returning *;
$$;

create or replace function public.claim_reminders()
returns setof appointments language sql volatile security definer set search_path = public as $$
  with due as (
    select distinct coalesce(cart_id, id) g from appointments
     where reminder_sent_at is null and client_email is not null and status in ('pendiente','confirmada')
       and starts_at between now() and now() + interval '2 hours')
  update appointments a set reminder_sent_at = now() from due
   where coalesce(a.cart_id, a.id) = due.g and a.reminder_sent_at is null and a.status in ('pendiente','confirmada')
  returning a.*;
$$;

revoke all on function public.claim_confirmations() from public, anon, authenticated;
revoke all on function public.claim_reminders() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_confirmations() to service_role;
    grant execute on function public.claim_reminders() to service_role;
  end if;
end $$;
