-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Endurecimiento: límite de reservas de invitado por IP
-- y retiro de permisos sobrantes. Re-ejecutable. Ejecutar después de 12. No modifica citas.
-- =====================================================================
create table if not exists public.guest_rate (ip text not null, at timestamptz not null default now());
create index if not exists guest_rate_ip_at on public.guest_rate (ip, at);
alter table public.guest_rate enable row level security;   -- sin políticas: nadie la lee desde la API
revoke all on public.guest_rate from public, anon, authenticated;

-- Máximo 5 reservas sin cuenta por hora desde una misma IP. Supabase recibe la IP real en cf-connecting-ip.
create or replace function public._guest_rate_check() returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_h jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
        v_ip text := nullif(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1), '');
begin
  if v_ip is null then return; end if;
  delete from guest_rate where at < now() - interval '1 day';
  if (select count(*) from guest_rate where ip = v_ip and at > now() - interval '1 hour') >= 5 then
    raise exception 'DEMASIADOS_INTENTOS';
  end if;
  insert into guest_rate (ip) values (v_ip);
end $$;
revoke all on function public._guest_rate_check() from public, anon, authenticated;

create or replace function public.book_cart_guest(p_name text, p_phone text, p_email text, p_services uuid[], p_barber uuid,
  p_start timestamptz, p_notes text default null, p_extras jsonb default null, p_payment text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[]; a appointments;
begin
  perform _guest_rate_check();
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'NOMBRE_INVALIDO'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 7 and 15 then raise exception 'CELULAR_INVALIDO'; end if;
  if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'CORREO_INVALIDO'; end if;
  perform set_config('eb.guest', jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'email', lower(trim(p_email)))::text, true);
  ids := book_cart(p_services, p_barber, p_start, p_notes, p_extras, p_payment);
  perform set_config('eb.guest', '', true);
  select * into a from appointments where id = ids[1];
  return jsonb_build_object('ids', to_jsonb(ids), 'barber', a.barber_name, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status);
end $$;

-- Permisos sobrantes: RLS ya frena estas escrituras, pero TRUNCATE no pasa por RLS.
revoke insert, update, delete on public.barbers, public.gallery, public.profiles, public.schedules,
  public.service_categories, public.services, public.settings from anon;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
revoke execute on function public._appt_income(), public._appt_services_reset() from public, anon, authenticated;
