-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Cada barbero ve y maneja SOLO sus citas y sus bloqueos.
-- (Los cierres de todo el negocio los sigue viendo, pero solo el dueño los crea o borra.)
-- Re-ejecutable. No modifica datos.
-- =====================================================================

create or replace function public._staff_own(p_appt uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if my_barber_id() is null or not exists (select 1 from appointments where id = p_appt and barber_id = my_barber_id())
    then raise exception 'NO_AUTORIZADO'; end if;
end $$;
revoke all on function public._staff_own(uuid) from public, anon, authenticated;

create or replace function public.staff_save_appointment(
  p_id uuid, p_client_id uuid, p_client_name text, p_client_phone text,
  p_service uuid, p_barber uuid, p_start timestamptz, p_admin_notes text default null, p_status text default 'confirmada')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  if p_barber is distinct from my_barber_id() then raise exception 'NO_AUTORIZADO'; end if;   -- solo citas para él
  if p_id is not null then perform _staff_own(p_id); end if;
  perform _staff_begin();
  v := admin_save_appointment(p_id, p_client_id, p_client_name, p_client_phone, p_service, p_barber, p_start, p_admin_notes, p_status);
  perform set_config('eb.staff', '', true);
  return v;
end $$;

create or replace function public.staff_set_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform _staff_own(p_id);
  perform _staff_begin();
  perform admin_set_status(p_id, p_status, p_reason);
  perform set_config('eb.staff', '', true);
end $$;

create or replace function public.staff_set_notes(p_id uuid, p_notes text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform _staff_own(p_id);
  perform _staff_begin();
  perform admin_set_notes(p_id, p_notes);
  perform set_config('eb.staff', '', true);
end $$;

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (client_id = auth.uid() or is_admin() or barber_id = my_barber_id());

drop policy if exists time_off_read on public.time_off;
create policy time_off_read on public.time_off for select to authenticated
  using (is_admin() or (my_barber_id() is not null and (barber_id is null or barber_id = my_barber_id())));
drop policy if exists time_off_staff on public.time_off;
create policy time_off_staff on public.time_off for all to authenticated
  using (barber_id = my_barber_id()) with check (barber_id = my_barber_id());
