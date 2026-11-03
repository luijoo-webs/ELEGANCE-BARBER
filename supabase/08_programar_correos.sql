-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Tarea programada de correos (solo en Supabase, no en las pruebas locales).
-- Cada 5 minutos llama a la Edge Function "notificaciones" (confirmaciones pendientes y recordatorios de 2 h).
-- Re-ejecutable: cron.schedule con el mismo nombre reemplaza la tarea. Usa la clave pública (anon), no secretos.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('eb-correos', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bmbcyngdancirqvvyfdn.supabase.co/functions/v1/notificaciones',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtYmN5bmdkYW5jaXJxdnZ5ZmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyOTQ3MDIsImV4cCI6MjEwODg3MDcwMn0.AhYa7aXI71NH-4kPlgTwZ5kEFkJ2pfKKFPsE6FEb9-Q"}'::jsonb,
    body := '{}'::jsonb);
$$);
