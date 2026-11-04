-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Puerta de servidor para las reservas sin cuenta.
-- Solo la función "reservar" (service_role) la usa, tras validar Turnstile.
-- Pasa la IP real del visitante para que siga aplicando el límite por IP.
-- Re-ejecutable. Solo agrega: la reserva actual sigue funcionando igual.
-- =====================================================================
create or replace function public.book_cart_guest_gate(p_ip text, p_name text, p_phone text, p_email text, p_services uuid[], p_barber uuid,
  p_start timestamptz, p_notes text default null, p_extras jsonb default null, p_payment text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('request.headers', jsonb_build_object('cf-connecting-ip', p_ip)::text, true);
  return book_cart_guest(p_name, p_phone, p_email, p_services, p_barber, p_start, p_notes, p_extras, p_payment);
end $$;
revoke all on function public.book_cart_guest_gate(text, text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.book_cart_guest_gate(text, text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) to service_role;
