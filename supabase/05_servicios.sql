-- =====================================================================
-- ELEGANCE BARBER — Servicios indicados por el dueño: Corte full, Keratina, Aminoácidos.
-- Duración 30 min (regla del negocio). Precio por definir: edítalo en Admin → Servicios.
-- Re-ejecutable: no duplica ni borra nada.
-- =====================================================================
insert into public.service_categories (name, sort_order)
select v.name, v.ord from (values ('Cortes', 1), ('Tratamientos', 2)) v(name, ord)
where not exists (select 1 from public.service_categories c where lower(c.name) = lower(v.name));

insert into public.services (category_id, name, duration_min, price, sort_order)
select (select id from public.service_categories where lower(name) = lower(v.cat) limit 1), v.name, 30, null, v.ord
from (values ('Cortes', 'Corte full', 1), ('Tratamientos', 'Keratina', 2), ('Tratamientos', 'Aminoácidos', 3)) v(cat, name, ord)
where not exists (select 1 from public.services s where lower(s.name) = lower(v.name) and s.deleted_at is null);
