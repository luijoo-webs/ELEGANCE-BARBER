-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Reserva como invitado (sin cuenta).
-- Re-ejecutable. Ejecutar después de 07.
-- =====================================================================

-- Validación de adicionales compartida.
create or replace function public._check_extras(p_extras jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare e jsonb;
begin
  if p_extras is null or jsonb_typeof(p_extras) <> 'array' or jsonb_array_length(p_extras) > 20 then raise exception 'ADICIONALES_INVALIDOS'; end if;
  for e in select * from jsonb_array_elements(p_extras) loop
    if jsonb_typeof(e->'n') <> 'string' or length(e->>'n') not between 1 and 60
       or jsonb_typeof(e->'q') <> 'number' or (e->>'q')::numeric not in (1,2,3,4,5,6,7,8,9,10)
       or jsonb_typeof(e->'p') <> 'number' or (e->>'p')::numeric not between 0 and 100000 then
      raise exception 'ADICIONALES_INVALIDOS';
    end if;
  end loop;
end $$;

-- book_appointment: igual que en 07; sin sesión solo funciona llamado desde book_cart_guest (datos del invitado).
-- El límite de reservas activas del invitado se cuenta por su correo o su celular.
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
  v_guest jsonb := nullif(current_setting('eb.guest', true), '')::jsonb;   -- lo pone book_cart_guest
  v_cart uuid := nullif(current_setting('eb.cart', true), '')::uuid;   -- lo pone book_cart
  v_status text := case when coalesce((r->>'confirmacion_automatica')::boolean, true) then 'confirmada' else 'pendiente' end;
begin
  if v_uid is null and v_guest is null then raise exception 'NO_AUTENTICADO'; end if;
  select * into v_prof from profiles where id = v_uid;
  if v_uid is null then v_prof.full_name := v_guest->>'name'; v_prof.phone := v_guest->>'phone'; v_prof.email := v_guest->>'email'; end if;
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
  if (select count(distinct coalesce(cart_id, id)) from appointments where (client_id = v_uid or (v_uid is null and client_id is null
          and (lower(client_email) = lower(v_prof.email) or regexp_replace(client_phone, '\D', '', 'g') = regexp_replace(v_prof.phone, '\D', '', 'g')))) and status in ('pendiente','confirmada') and starts_at > now()
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

-- book_cart: igual que en 06/07, pero los adicionales se guardan sin pedir sesión (sirve también al invitado).
create or replace function public.book_cart(p_services uuid[], p_barber uuid, p_start timestamptz,
  p_notes text default null, p_extras jsonb default null)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := '{}'; t timestamptz := p_start; b uuid := p_barber; aid uuid; i int;
begin
  if p_services is null or coalesce(array_length(p_services, 1), 0) not between 1 and 10 then raise exception 'CARRITO_INVALIDO'; end if;
  if p_extras is not null and p_extras <> '[]'::jsonb then perform _check_extras(p_extras); end if;
  perform set_config('eb.cart', gen_random_uuid()::text, true);
  for i in 1 .. array_length(p_services, 1) loop
    aid := book_appointment(p_services[i], b, t, case when i = 1 then p_notes end);
    select barber_id, ends_at into b, t from appointments where id = aid;
    ids := ids || aid;
  end loop;
  perform set_config('eb.cart', '', true);
  if p_extras is not null and p_extras <> '[]'::jsonb then
    update appointments set extras = p_extras where id = ids[1];
  end if;
  return ids;
end $$;

-- Reserva sin cuenta: nombre, celular y correo (para la confirmación y el recordatorio).
create or replace function public.book_cart_guest(p_name text, p_phone text, p_email text, p_services uuid[], p_barber uuid,
  p_start timestamptz, p_notes text default null, p_extras jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[]; a appointments; v_end timestamptz;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'NOMBRE_INVALIDO'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 7 and 15 then raise exception 'CELULAR_INVALIDO'; end if;
  if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'CORREO_INVALIDO'; end if;
  perform set_config('eb.guest', jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'email', lower(trim(p_email)))::text, true);
  ids := book_cart(p_services, p_barber, p_start, p_notes, p_extras);
  perform set_config('eb.guest', '', true);
  select * into a from appointments where id = ids[1];
  select max(ends_at) into v_end from appointments where id = any(ids);
  return jsonb_build_object('ids', to_jsonb(ids), 'barber', a.barber_name, 'starts_at', a.starts_at, 'ends_at', v_end, 'status', a.status);
end $$;

revoke all on function public._check_extras(jsonb) from public, anon, authenticated;
revoke all on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb) from public;
grant execute on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb) to anon, authenticated;
