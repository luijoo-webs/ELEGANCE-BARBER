-- =====================================================================
-- THE ELEGANCE OF THE BARBER — WhatsApp de cada barbero.
-- La reserva le escribe al barbero asignado; si no tiene número, al de la barbería.
-- Es público a propósito: el cliente lo ve igual al abrir el WhatsApp.
-- Re-ejecutable. Solo agrega una columna: no modifica datos.
-- =====================================================================
alter table public.barbers add column if not exists whatsapp text;
alter table public.barbers drop constraint if exists barbers_whatsapp_check;
alter table public.barbers add constraint barbers_whatsapp_check check (whatsapp is null or whatsapp ~ '^[0-9]{7,15}$');
