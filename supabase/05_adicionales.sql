-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Adicionales (snacks y bebidas) en la reserva.
-- Re-ejecutable: solo agrega una columna y una función. Ejecutar después de 04.
-- =====================================================================

-- [{"n": "Coronita", "q": 2, "p": 4500}, ...]  Se pagan en la barbería; es solo el pedido.
alter table public.appointments add column if not exists extras jsonb;

-- El cliente agrega o cambia los adicionales de su propia cita activa.
create or replace function public.set_appointment_extras(p_id uuid, p_extras jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a appointments; e jsonb;
begin
  select * into a from appointments where id = p_id and client_id = auth.uid() for update;
  if a.id is null then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if a.status not in ('pendiente','confirmada') then raise exception 'CITA_NO_MODIFICABLE'; end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'array' or jsonb_array_length(p_extras) > 20 then raise exception 'ADICIONALES_INVALIDOS'; end if;
  for e in select * from jsonb_array_elements(p_extras) loop
    if jsonb_typeof(e->'n') <> 'string' or length(e->>'n') not between 1 and 60
       or jsonb_typeof(e->'q') <> 'number' or (e->>'q')::numeric not in (1,2,3,4,5,6,7,8,9,10)
       or jsonb_typeof(e->'p') <> 'number' or (e->>'p')::numeric not between 0 and 100000 then
      raise exception 'ADICIONALES_INVALIDOS';
    end if;
  end loop;
  update appointments set extras = case when jsonb_array_length(p_extras) = 0 then null else p_extras end where id = p_id;
end $$;

revoke all on function public.set_appointment_extras(uuid, jsonb) from public, anon;
grant execute on function public.set_appointment_extras(uuid, jsonb) to authenticated;
