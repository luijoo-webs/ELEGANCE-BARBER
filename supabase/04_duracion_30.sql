-- =====================================================================
-- ELEGANCE BARBER — Cada corte dura 30 min (para bases creadas antes de este cambio).
-- Ejecutar DESPUÉS de 01–03. Re-ejecutable. No borra datos.
-- =====================================================================
alter table public.services alter column duration_min set default 30;
update public.settings set value = jsonb_set(value, '{intervalo_min}', '30') where key = 'reservas';
update public.services set duration_min = 30 where name ilike '%corte%' and duration_min <> 30;
