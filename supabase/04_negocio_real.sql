-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Datos reales del negocio y registro legal.
-- Re-ejecutable: no duplica ni borra nada. Ejecutar después de 01 y 03.
-- =====================================================================

-- 1. Nombre completo, 35 minutos por cliente --------------------------------
update public.settings set value = value || '{"nombre": "The Elegance of the Barber"}' where key = 'negocio';
update public.settings set value = jsonb_set(value, '{intervalo_min}', '35') where key = 'reservas';
alter table public.services alter column duration_min set default 35;

-- 2. Servicios y precios (lavado de cabello incluido en todos) ---------------
insert into public.service_categories (name, sort_order)
select v.name, v.ord from (values ('Cortes', 1), ('Barba y rostro', 2), ('Tratamientos', 3)) v(name, ord)
where not exists (select 1 from public.service_categories c where lower(c.name) = lower(v.name));

insert into public.services (category_id, name, description, duration_min, price, sort_order)
select (select id from public.service_categories where lower(name) = lower(v.cat) limit 1),
       v.name, 'Incluye lavado de cabello.', 35, v.price, v.ord
from (values
  ('Cortes', 'Corte de cabello básico', 25000, 1),
  ('Cortes', 'Corte de niños', 23000, 2),
  ('Cortes', 'Corte a tijeras', 28000, 3),
  ('Cortes', 'Corte y barba', 30000, 4),
  ('Cortes', 'Corte, secado y planchado', 30000, 5),
  ('Cortes', 'Corte y keratina', 60000, 6),
  ('Cortes', 'Cerquillos', 8000, 7),
  ('Barba y rostro', 'Barba', 12000, 8),
  ('Barba y rostro', 'Cejas', 5000, 9),
  ('Barba y rostro', 'Pigmentación de corte o barba', 5000, 10),
  ('Barba y rostro', 'Mascarilla black (puntos negros)', 7000, 11),
  ('Tratamientos', 'Keratina', 35000, 12),
  ('Tratamientos', 'Cepillado y planchado', 12000, 13)
) v(cat, name, price, ord)
where not exists (select 1 from public.services s where lower(s.name) = lower(v.name) and s.deleted_at is null);

update public.services set duration_min = 35 where deleted_at is null and duration_min <> 35;

-- 3. Horario general: lunes a sábado 9:30 a.m. – 8:00 p.m. (domingo cerrado) --
insert into public.schedules (barber_id, weekday, start_time, end_time)
select null, d, '09:30', '20:00' from generate_series(1, 6) d
where not exists (select 1 from public.schedules where barber_id is null);

-- 4. Dos barberos (nombre y foto pendientes; se editan en Admin → Barberos) --
insert into public.barbers (name, bio, sort_order)
select v.name, 'Nombre y foto pendientes de actualizar.', v.ord
from (values ('Barbero 1', 1), ('Barbero 2', 2)) v(name, ord)
where not exists (select 1 from public.barbers where deleted_at is null);

-- 5. Registro de aceptación de términos y privacidad (Ley 1581 de 2012) ------
-- Solo se inserta (por la función); nadie puede editarlo ni borrarlo desde la web.
create table if not exists public.consent_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                      -- auth.uid() de quien aceptó (null si aún no tenía sesión)
  email       text check (char_length(email) <= 200),
  full_name   text check (char_length(full_name) <= 120),
  document    text not null check (document in ('terminos', 'privacidad')),
  version     text not null check (char_length(version) <= 20),
  form        text not null check (form in ('registro', 'reserva')),
  page_url    text check (char_length(page_url) <= 500),
  user_agent  text check (char_length(user_agent) <= 500),
  ip          text,                      -- tomada por el servidor, no por el navegador
  accepted_at timestamptz not null default now()
);
create index if not exists consent_log_email on public.consent_log (lower(email));
alter table public.consent_log enable row level security;
drop policy if exists consent_admin_read on public.consent_log;
create policy consent_admin_read on public.consent_log for select to authenticated using (is_admin());
revoke insert, update, delete on public.consent_log from anon, authenticated;

create or replace function public.log_consent(p_documents text[], p_version text, p_form text,
  p_email text, p_full_name text, p_page_url text, p_user_agent text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_ip text;
begin
  if coalesce(array_length(p_documents, 1), 0) = 0 or array_length(p_documents, 1) > 2 then raise exception 'CONSENTIMIENTO_INVALIDO'; end if;
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  insert into consent_log (user_id, email, full_name, document, version, form, page_url, user_agent, ip)
  select auth.uid(), left(lower(trim(p_email)), 200), left(trim(p_full_name), 120), d, left(p_version, 20), p_form,
         left(p_page_url, 500), left(p_user_agent, 500), nullif(trim(v_ip), '')
  from unnest(p_documents) d;
end $$;
revoke execute on function public.log_consent(text[], text, text, text, text, text, text) from public;
grant execute on function public.log_consent(text[], text, text, text, text, text, text) to anon, authenticated;
