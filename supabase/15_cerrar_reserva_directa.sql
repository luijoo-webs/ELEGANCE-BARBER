-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Cierra la reserva directa sin cuenta.
-- Ejecutar SOLO cuando la web ya reserve por la función "reservar" y esté probada.
-- Para deshacer: grant execute on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) to anon, authenticated;
-- =====================================================================
revoke execute on function public.book_cart_guest(text, text, text, uuid[], uuid, timestamptz, text, jsonb, text) from public, anon, authenticated;
