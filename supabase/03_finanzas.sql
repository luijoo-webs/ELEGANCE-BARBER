-- =====================================================================
-- ELEGANCE BARBER — Finanzas y limpieza de citas canceladas
-- Ejecutar DESPUÉS de 01_esquema.sql. Re-ejecutable, no borra datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MOVIMIENTOS: gastos del local e ingresos realmente recibidos.
--    Las citas NO son dinero: un ingreso solo existe si el admin lo registra
--    (opcionalmente vinculado a la cita que lo originó).
-- ---------------------------------------------------------------------
create table if not exists public.finance_entries (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('gasto','ingreso')),
  description    text not null check (char_length(trim(description)) between 1 and 200),
  category       text not null check (char_length(trim(category)) between 1 and 60),
  amount         numeric(12,2) not null check (amount > 0),
  entry_date     date not null,
  method         text check (char_length(method) <= 40),
  notes          text check (char_length(notes) <= 1000),
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists finance_entries_date on public.finance_entries (entry_date);
create index if not exists finance_entries_kind_date on public.finance_entries (kind, entry_date);

drop trigger if exists finance_entries_touch on public.finance_entries;
create trigger finance_entries_touch before update on public.finance_entries for each row execute function public._touch();
drop trigger if exists finance_entries_audit on public.finance_entries;
create trigger finance_entries_audit after insert or update or delete on public.finance_entries for each row execute function public._audit();

-- Solo administradores leen o escriben finanzas. Sin acceso anónimo.
alter table public.finance_entries enable row level security;
drop policy if exists finance_admin on public.finance_entries;
create policy finance_admin on public.finance_entries for all to authenticated using (is_admin()) with check (is_admin());
revoke all on public.finance_entries from anon;

-- ---------------------------------------------------------------------
-- 2. ELIMINAR DEFINITIVAMENTE UNA CITA CANCELADA
--    Solo admin y solo estado 'cancelada' (las activas no se pueden borrar).
--    Una cancelada no ocupa horario, así que la disponibilidad no cambia.
--    El trigger de auditoría guarda la fila completa antes de borrarla, y
--    los ingresos vinculados conservan su registro (appointment_id → null).
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_appointment(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_status text;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select status into v_status from appointments where id = p_id for update;
  if not found then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if v_status <> 'cancelada' then raise exception 'SOLO_CANCELADAS'; end if;
  delete from appointments where id = p_id;
end $$;

revoke execute on function public.admin_delete_appointment(uuid) from public, anon;
grant execute on function public.admin_delete_appointment(uuid) to authenticated;
