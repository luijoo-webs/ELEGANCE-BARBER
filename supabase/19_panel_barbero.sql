-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Mini panel del barbero: Agenda, Citas, Ventas y su WhatsApp.
-- Las funciones staff_* verifican que sea barbero y reutilizan las del administrador,
-- así citas y ventas funcionan exactamente igual. El barbero NO ve finanzas, facturas,
-- inventario ni configuración; no borra citas y solo vende con fecha de hoy.
-- Re-ejecutable. No modifica datos.
-- =====================================================================

-- is_admin() es verdadero para un barbero solo DENTRO de una función staff_* (marca local de la transacción).
-- El cliente no puede poner esa marca: set_config no está expuesto en la API.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()
    and (role = 'admin' or (role = 'barber' and barber_id is not null and current_setting('eb.staff', true) = '1')));
$$;

create or replace function public._staff_begin() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if my_barber_id() is null then raise exception 'NO_AUTORIZADO'; end if;
  perform set_config('eb.staff', '1', true);
end $$;
revoke all on function public._staff_begin() from public, anon, authenticated;

create or replace function public.staff_save_appointment(
  p_id uuid, p_client_id uuid, p_client_name text, p_client_phone text,
  p_service uuid, p_barber uuid, p_start timestamptz, p_admin_notes text default null, p_status text default 'confirmada')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  perform _staff_begin();
  v := admin_save_appointment(p_id, p_client_id, p_client_name, p_client_phone, p_service, p_barber, p_start, p_admin_notes, p_status);
  perform set_config('eb.staff', '', true);
  return v;
end $$;

create or replace function public.staff_set_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform _staff_begin();
  perform admin_set_status(p_id, p_status, p_reason);
  perform set_config('eb.staff', '', true);
end $$;

create or replace function public.staff_set_notes(p_id uuid, p_notes text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform _staff_begin();
  perform admin_set_notes(p_id, p_notes);
  perform set_config('eb.staff', '', true);
end $$;

create or replace function public.staff_sale(p_lines jsonb, p_method text, p_day date, p_barber text default null, p_client text default null, p_email text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  if p_day is distinct from (now() at time zone 'America/Bogota')::date then raise exception 'VENTA_INVALIDA'; end if;   -- el barbero vende solo hoy
  perform _staff_begin();
  v := admin_sale(p_lines, p_method, p_day, p_barber, p_client, p_email);
  perform set_config('eb.staff', '', true);
  return v;
end $$;

-- Configuración del barbero: solo su número de WhatsApp.
create or replace function public.staff_set_whatsapp(p_whatsapp text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
begin
  if my_barber_id() is null then raise exception 'NO_AUTORIZADO'; end if;
  if length(v) = 10 then v := '57' || v; end if;
  update barbers set whatsapp = v where id = my_barber_id();
end $$;

revoke all on function public.staff_save_appointment(uuid, uuid, text, text, uuid, uuid, timestamptz, text, text),
  public.staff_set_status(uuid, text, text), public.staff_set_notes(uuid, text),
  public.staff_sale(jsonb, text, date, text, text, text), public.staff_set_whatsapp(text) from public, anon;
grant execute on function public.staff_save_appointment(uuid, uuid, text, text, uuid, uuid, timestamptz, text, text),
  public.staff_set_status(uuid, text, text), public.staff_set_notes(uuid, text),
  public.staff_sale(jsonb, text, date, text, text, text), public.staff_set_whatsapp(text) to authenticated;

-- Lectura para el panel del barbero: la agenda de toda la barbería, los bloqueos, las cuentas de clientes
-- (para agendar a quien ya tiene cuenta) y las ventas de hoy. Nada de finanzas ni facturas.
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (client_id = auth.uid() or is_admin() or my_barber_id() is not null);

drop policy if exists time_off_read on public.time_off;
create policy time_off_read on public.time_off for select to authenticated using (is_admin() or my_barber_id() is not null);
drop policy if exists time_off_staff on public.time_off;
create policy time_off_staff on public.time_off for all to authenticated using (my_barber_id() is not null) with check (my_barber_id() is not null);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_admin() or (my_barber_id() is not null and role = 'client'));

drop policy if exists finance_staff_sales on public.finance_entries;
create policy finance_staff_sales on public.finance_entries for select to authenticated
  using (my_barber_id() is not null and kind = 'ingreso' and description like 'Venta%'
         and entry_date = (now() at time zone 'America/Bogota')::date);

-- La factura de lo que se vendió o cobró hoy (botón "Ver factura" de Ventas y de la cita). Nada de días anteriores.
drop policy if exists invoices_staff_today on public.invoices;
create policy invoices_staff_today on public.invoices for select to authenticated
  using (my_barber_id() is not null and (issued_at at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date);
