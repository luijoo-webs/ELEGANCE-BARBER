-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Enlace privado por cita ("Ver la cita con fotos").
-- Quien tiene el enlace ve la cita en solo lectura, sin correo ni celular, hasta 30 días
-- después de la fecha de la cita. Re-ejecutable. No borra datos.
-- =====================================================================
alter table public.appointments add column if not exists link_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists appointments_link_token_uq on public.appointments (link_token);

-- Entrega el código a quien acaba de reservar: el id solo lo conoce él y sirve 30 minutos.
create or replace function public.appointment_link(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select link_token from appointments where id = p_id and created_at > now() - interval '30 minutes';
$$;

create or replace function public.appointment_by_link(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('client_name', client_name, 'barber_name', barber_name, 'service_name', service_name, 'services', services,
    'price', price, 'extras', extras, 'starts_at', starts_at, 'ends_at', ends_at, 'status', status, 'payment_method', payment_method, 'notes', client_notes)
  from appointments where length(p_token) >= 24 and link_token = p_token and starts_at > now() - interval '30 days';
$$;

revoke all on function public.appointment_link(uuid), public.appointment_by_link(text) from public;
grant execute on function public.appointment_link(uuid), public.appointment_by_link(text) to anon, authenticated;
