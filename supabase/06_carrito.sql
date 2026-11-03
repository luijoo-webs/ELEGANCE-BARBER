-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Carrito: varios servicios seguidos en una sola reserva.
-- Re-ejecutable: solo crea una función. Ejecutar después de 05.
-- =====================================================================

-- Reserva los servicios uno tras otro con el mismo barbero (todo o nada: si uno falla, no queda ninguno).
-- Usa book_appointment para cada uno, así se aplican las mismas reglas (horario, solapes, límite de reservas).
create or replace function public.book_cart(p_services uuid[], p_barber uuid, p_start timestamptz,
  p_notes text default null, p_extras jsonb default null)
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := '{}'; t timestamptz := p_start; b uuid := p_barber; aid uuid; i int;
begin
  if p_services is null or coalesce(array_length(p_services, 1), 0) not between 1 and 5 then raise exception 'CARRITO_INVALIDO'; end if;
  for i in 1 .. array_length(p_services, 1) loop
    aid := book_appointment(p_services[i], b, t, case when i = 1 then p_notes end);
    select barber_id, ends_at into b, t from appointments where id = aid;
    ids := ids || aid;
  end loop;
  if p_extras is not null and jsonb_typeof(p_extras) = 'array' and jsonb_array_length(p_extras) > 0 then
    perform set_appointment_extras(ids[1], p_extras);
  end if;
  return ids;
end $$;

revoke all on function public.book_cart(uuid[], uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function public.book_cart(uuid[], uuid, timestamptz, text, jsonb) to authenticated;
