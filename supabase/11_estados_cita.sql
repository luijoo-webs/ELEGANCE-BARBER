-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Seguimiento de la cita:
-- pendiente → confirmada → en_proceso (en la silla) → completada, o no_asistio (no vino).
-- Solo "completada" suma a finanzas. Re-ejecutable. Ejecutar después de 10. No modifica citas.
-- =====================================================================
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pendiente','confirmada','en_proceso','cancelada','completada','no_asistio'));

-- Una cita en la silla ocupa el horario; la de quien no vino lo libera.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap exclude using gist (
  barber_id with =, tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('pendiente','confirmada','en_proceso','completada'));

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
               and (a.status in ('confirmada','en_proceso','completada')
                    or (a.status = 'pendiente' and (a.pending_expires_at is null or a.pending_expires_at > now())))) then
    return 'HORARIO_OCUPADO';
  end if;
  return null;
end $$;

-- El admin puede moverse entre estados para corregir un error; una cancelada no vuelve.
create or replace function public.admin_set_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a appointments;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into a from appointments where id = p_id for update;
  if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if a.status = p_status then return; end if;
  if p_status not in ('pendiente','confirmada','en_proceso','completada','no_asistio','cancelada')
     or a.status = 'cancelada' or (a.status = 'completada' and p_status = 'cancelada') then
    raise exception 'TRANSICION_INVALIDA';
  end if;
  -- Quien llegó antes de su hora ya está en la silla y sí se puede completar.
  if a.starts_at > now() and (p_status = 'no_asistio' or (p_status = 'completada' and a.status <> 'en_proceso')) then
    raise exception 'CITA_FUTURA';
  end if;
  update appointments
     set status = p_status,
         pending_expires_at = null,
         cancel_reason = case when p_status = 'cancelada' then left(coalesce(nullif(trim(p_reason), ''), 'Cancelada por la barbería'), 300) end,
         cancelled_at  = case when p_status = 'cancelada' then now() end,
         cancelled_by  = case when p_status = 'cancelada' then auth.uid() end
   where id = p_id;
end $$;

-- admin_stats: igual que en 10, pero quien no vino no cuenta como atendido ni pedido.
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
    'valor_completadas', (select sum(price) from a where status = 'completada'),
    'completadas_sin_precio', (select count(*) from a where status = 'completada' and price is null),
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
