-- =====================================================================
-- THE ELEGANCE OF THE BARBER — Inventario, catálogo de productos y facturas.
-- Los productos pasan del código a la base de datos, con las mismas filas y precios que ya tenía la web.
-- Cada cobro (cita completada o venta en caja) crea una factura numerada y, si hay correo, se le envía al cliente.
-- Re-ejecutable. Ejecutar después de 16. No borra datos.
-- =====================================================================

/* ---------- Productos ---------- */
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  name        text not null check (length(name) between 1 and 60),
  category    text not null check (length(category) between 1 and 40),
  description text check (length(description) <= 600),
  price       numeric(12,2) not null check (price >= 0),
  stock       integer check (stock >= 0),          -- null = todavía sin contar: no se descuenta ni se agota
  min_stock   integer not null default 3 check (min_stock >= 0),
  image_url   text,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
-- Las citas guardan el producto por nombre: no puede haber dos vigentes con el mismo.
create unique index if not exists products_name_uq on public.products (lower(name)) where deleted_at is null;

alter table public.products enable row level security;
drop policy if exists products_read on public.products;
create policy products_read on public.products for select using ((active and deleted_at is null) or is_admin());
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all to authenticated using (is_admin()) with check (is_admin());
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;

insert into public.products (slug, name, category, price, image_url, sort_order)
select v.slug, v.name, v.category, v.price, 'assets/tienda/' || v.slug || '.jpg?v=2', v.ord
from (values
  ('detodito', 'Detodito', 'Snacks', 3500, 1), ('margaritas', 'Margaritas (pollo, limón, tomate…)', 'Snacks', 3000, 2), ('natuchip', 'Natuchip', 'Snacks', 3000, 3),
  ('boliquesos', 'Boliquesos', 'Snacks', 2500, 4), ('doritos', 'Doritos', 'Snacks', 3000, 5), ('cheestre', 'Cheestris', 'Snacks', 2500, 6),
  ('choclitos', 'Choclitos', 'Snacks', 2500, 7), ('manis', 'Maní', 'Snacks', 2000, 8), ('chockis', 'Chokis', 'Snacks', 2000, 9),
  ('coronita', 'Coronita', 'Cervezas', 4500, 10), ('club-colombia', 'Club Colombia', 'Cervezas', 4500, 11), ('stella-botella', 'Stella Artois botella', 'Cervezas', 6000, 12),
  ('stella-lata', 'Stella Artois lata', 'Cervezas', 5000, 13), ('costena', 'Costeña', 'Cervezas', 4000, 14), ('miller-lite', 'Miller Lite', 'Cervezas', 4000, 15),
  ('coca-cola', 'Coca-Cola personal', 'Gaseosas', 3500, 16), ('coca-zero', 'Coca-Cola Zero pequeña', 'Gaseosas', 2000, 17), ('agua-saborizada', 'Agua saborizada pequeña', 'Gaseosas', 2000, 18),
  ('ginger', 'Ginger personal', 'Gaseosas', 3000, 19), ('sprite', 'Sprite personal', 'Gaseosas', 3000, 20), ('quatro-personal', 'Quatro personal', 'Gaseosas', 3000, 21),
  ('kola-roman', 'Kola Román pequeña', 'Gaseosas', 2000, 22), ('jugo-del-valle', 'Jugo del Valle', 'Gaseosas', 3500, 23), ('agua', 'Agua personal', 'Gaseosas', 2000, 24),
  ('quatro-pequena', 'Quatro pequeña', 'Gaseosas', 2000, 25), ('speed-max', 'Speed Max', 'Gaseosas', 2500, 26), ('soda', 'Soda', 'Gaseosas', 3000, 27)
) as v(slug, name, category, price, ord)
on conflict (slug) do nothing;

-- Los adicionales de una reserva se validan contra el catálogo: el precio lo pone el servidor, no el navegador.
create or replace function public._check_extras(p_extras jsonb)
returns void language plpgsql stable set search_path = public as $$
declare e jsonb; v products;
begin
  if p_extras is null or jsonb_typeof(p_extras) <> 'array' or jsonb_array_length(p_extras) > 20 then raise exception 'ADICIONALES_INVALIDOS'; end if;
  for e in select * from jsonb_array_elements(p_extras) loop
    if jsonb_typeof(e->'n') <> 'string' or length(e->>'n') not between 1 and 60
       or jsonb_typeof(e->'q') <> 'number' or (e->>'q')::numeric not in (1,2,3,4,5,6,7,8,9,10)
       or jsonb_typeof(e->'p') <> 'number' then
      raise exception 'ADICIONALES_INVALIDOS';
    end if;
    select * into v from products where name = e->>'n' and active and deleted_at is null;
    if not found or v.price <> (e->>'p')::numeric then raise exception 'PRODUCTO_NO_DISPONIBLE'; end if;
    if v.stock is not null and v.stock < (e->>'q')::numeric then raise exception 'PRODUCTO_AGOTADO'; end if;
  end loop;
end $$;

-- Mueve el inventario según una lista [{n,q,...}]. Nunca baja de 0: si el conteo estaba mal, la venta no se frena.
-- shortcut: se cruza por nombre; renombrar un producto deja sin descontar las citas ya reservadas con el nombre anterior.
create or replace function public._stock_move(p_items jsonb, p_sign integer)
returns void language sql volatile security definer set search_path = public as $$
  update products p set stock = greatest(p.stock + p_sign * x.q, 0)
    from (select e->>'n' as n, sum((e->>'q')::numeric)::integer as q from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e group by 1) x
   where p.name = x.n and p.stock is not null and p.deleted_at is null;
$$;
revoke all on function public._stock_move(jsonb, integer) from public, anon, authenticated;

create or replace function public.admin_stock(p_id uuid, p_delta integer)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v integer;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update products set stock = greatest(coalesce(stock, 0) + p_delta, 0) where id = p_id and deleted_at is null returning stock into v;
  if not found then raise exception 'PRODUCTO_NO_DISPONIBLE'; end if;
  return v;
end $$;
revoke all on function public.admin_stock(uuid, integer) from public, anon;
grant execute on function public.admin_stock(uuid, integer) to authenticated;

/* ---------- Facturas ---------- */
create sequence if not exists public.invoice_no;
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         bigint not null unique default nextval('public.invoice_no'),
  appointment_id uuid references public.appointments(id) on delete set null,
  client_name    text,
  client_email   text,
  client_phone   text,
  barber_name    text,
  items          jsonb not null,
  total          numeric(12,2) not null check (total >= 0),
  method         text,
  issued_at      timestamptz not null default now(),
  email_sent_at  timestamptz,
  voided_at      timestamptz
);
create unique index if not exists invoices_appt_uq on public.invoices (appointment_id) where voided_at is null;
create index if not exists invoices_issued_idx on public.invoices (issued_at desc);

-- Solo las crea el servidor; el panel puede leerlas y corregir el correo o pedir el reenvío, nunca cambiar valores.
alter table public.invoices enable row level security;
drop policy if exists invoices_admin_read on public.invoices;
create policy invoices_admin_read on public.invoices for select to authenticated using (is_admin());
drop policy if exists invoices_admin_mail on public.invoices;
create policy invoices_admin_mail on public.invoices for update to authenticated using (is_admin()) with check (is_admin());
revoke all on public.invoices from public, anon, authenticated;
grant select on public.invoices to authenticated;
grant update (client_email, email_sent_at) on public.invoices to authenticated;

-- Al completar una cita: descuenta inventario y factura. Al deshacerla: devuelve y anula (el número no se reutiliza).
create or replace function public._appt_factura() returns trigger language plpgsql security definer set search_path = public as $$
declare v_x numeric; v_svc numeric; v_items jsonb;
begin
  if new.status = 'completada' and old.status <> 'completada' then
    perform _stock_move(new.extras, -1);
    select sum((e->>'q')::numeric * (e->>'p')::numeric) into v_x from jsonb_array_elements(coalesce(new.extras, '[]'::jsonb)) e;
    if coalesce(new.price, 0) + coalesce(v_x, 0) > 0 then
      select sum((s->>'p')::numeric) into v_svc from jsonb_array_elements(coalesce(new.services, '[]'::jsonb)) s;
      -- Si el precio se corrigió a mano y ya no cuadra con la lista de servicios, va en una sola línea.
      v_items := case
        when v_svc is not null and v_svc = new.price then (select jsonb_agg(jsonb_build_object('n', s->>'n', 'q', 1, 'p', (s->>'p')::numeric)) from jsonb_array_elements(new.services) s)
        when coalesce(new.price, 0) > 0 then jsonb_build_array(jsonb_build_object('n', new.service_name, 'q', 1, 'p', new.price))
        else '[]'::jsonb end || coalesce(new.extras, '[]'::jsonb);
      insert into invoices (appointment_id, client_name, client_email, client_phone, barber_name, items, total, method)
      values (new.id, new.client_name, new.client_email, new.client_phone, new.barber_name, v_items, coalesce(new.price, 0) + coalesce(v_x, 0), new.payment_method);
    end if;
  elsif old.status = 'completada' and new.status <> 'completada' then
    perform _stock_move(new.extras, 1);
    update invoices set voided_at = now() where appointment_id = new.id and voided_at is null;
  end if;
  return null;
end $$;
drop trigger if exists appt_factura on public.appointments;
create trigger appt_factura after update of status on public.appointments
  for each row execute function public._appt_factura();

-- Igual que en 12, pero borrar una cita completada también devuelve el inventario y anula su factura.
create or replace function public.admin_delete_appointment(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_status text; v_extras jsonb;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select status, extras into v_status, v_extras from appointments where id = p_id for update;
  if not found then raise exception 'CITA_NO_ENCONTRADA'; end if;
  if v_status not in ('cancelada','completada','no_asistio') then raise exception 'SOLO_CANCELADAS'; end if;
  if v_status = 'completada' then
    perform _stock_move(v_extras, 1);
    update invoices set voided_at = now() where appointment_id = p_id and voided_at is null;
  end if;
  delete from finance_entries where appointment_id = p_id and auto;
  delete from appointments where id = p_id;
end $$;

-- Venta en caja: en una sola operación registra el ingreso, descuenta inventario y crea la factura.
-- p_lines: [{n, q, p, svc}] (svc = servicio, no mueve inventario).
create or replace function public.admin_sale(p_lines jsonb, p_method text, p_day date, p_barber text default null, p_client text default null, p_email text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e jsonb; v_prods jsonb; v_notes text; v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_client text := nullif(trim(coalesce(p_client, '')), '');
  v_today date := (now() at time zone 'America/Bogota')::date; v_inv invoices; v_total numeric := 0;
begin
  if not is_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 or p_day is null or p_day > v_today then raise exception 'VENTA_INVALIDA'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'CORREO_INVALIDO'; end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(e->'n') <> 'string' or length(e->>'n') not between 1 and 80
       or jsonb_typeof(e->'q') <> 'number' or (e->>'q')::numeric not between 1 and 999 or (e->>'q')::numeric <> trunc((e->>'q')::numeric)
       or jsonb_typeof(e->'p') <> 'number' or (e->>'p')::numeric <= 0 then
      raise exception 'VENTA_INVALIDA';
    end if;
    v_total := v_total + (e->>'q')::numeric * (e->>'p')::numeric;
  end loop;

  v_notes := nullif(concat_ws(' · ', nullif(trim(coalesce(p_barber, '')), ''), v_client), '');
  insert into finance_entries (kind, description, category, amount, entry_date, method, notes)
  select 'ingreso', left('Venta: ' || (x->>'n') || case when (x->>'q')::numeric > 1 then ' ×' || (x->>'q') else '' end, 200), 'Servicios', (x->>'q')::numeric * (x->>'p')::numeric, p_day, p_method, v_notes
    from jsonb_array_elements(p_lines) x where (x->>'svc')::boolean is true;
  select jsonb_agg(x) into v_prods from jsonb_array_elements(p_lines) x where (x->>'svc')::boolean is not true;
  if v_prods is not null then
    insert into finance_entries (kind, description, category, amount, entry_date, method, notes)
    select 'ingreso', left('Venta adicionales: ' || string_agg((x->>'q') || '× ' || (x->>'n'), ', '), 200), 'Venta de productos', sum((x->>'q')::numeric * (x->>'p')::numeric), p_day, p_method, v_notes
      from jsonb_array_elements(v_prods) x;
    perform _stock_move(v_prods, -1);
  end if;

  insert into invoices (client_name, client_email, barber_name, items, total, method, issued_at)
  values (v_client, v_email, nullif(trim(coalesce(p_barber, '')), ''),
          (select jsonb_agg(jsonb_build_object('n', x->>'n', 'q', (x->>'q')::numeric, 'p', (x->>'p')::numeric)) from jsonb_array_elements(p_lines) x),
          v_total, p_method, case when p_day = v_today then now() else (p_day + time '12:00') at time zone 'America/Bogota' end)
  returning * into v_inv;
  return jsonb_build_object('id', v_inv.id, 'number', v_inv.number, 'total', v_inv.total);
end $$;
revoke all on function public.admin_sale(jsonb, text, date, text, text, text) from public, anon;
grant execute on function public.admin_sale(jsonb, text, date, text, text, text) to authenticated;

-- La función de correos reclama las facturas por enviar para no mandar dos veces.
create or replace function public.claim_invoices()
returns setof invoices language sql volatile security definer set search_path = public as $$
  update invoices set email_sent_at = now()
   where id in (select id from invoices where email_sent_at is null and client_email is not null and voided_at is null order by issued_at limit 20 for update skip locked)
  returning *;
$$;
revoke all on function public.claim_invoices() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_invoices() to service_role;
    grant select on public.products to service_role;
    grant update (email_sent_at) on public.invoices to service_role;
  end if;
end $$;
