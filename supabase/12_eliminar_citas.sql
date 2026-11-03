-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Eliminar citas ya cerradas (p. ej. las de prueba).
-- Además de las canceladas, se pueden borrar las completadas y las de quien no vino.
-- Se quita el ingreso automático de la cita; un ingreso registrado a mano se conserva.
-- La auditoría guarda la fila borrada. Re-ejecutable. Ejecutar después de 11.
-- =====================================================================
create or replace function public.admin_delete_appointment(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_status text;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select status into v_status from appointments where id = p_id for update;
  if not found then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if v_status not in ('cancelada','completada','no_asistio') then raise exception 'SOLO_CANCELADAS'; end if;
  delete from finance_entries where appointment_id = p_id and auto;
  delete from appointments where id = p_id;
end $$;
