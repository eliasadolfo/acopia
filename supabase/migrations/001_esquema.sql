-- ============================================================
-- ACOPIA — esquema base (multi-organización, RLS por membresía)
-- Prefijo de tablas: ac_
-- Modelo heredado del centro de acopio real (2.143 cajas, 83 pallets,
-- 2 exportaciones, 127 voluntarios): centro → caja → ítems → pallet → envío.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Organizaciones y membresía ----------
create table if not exists public.ac_orgs (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pais text,
  tipo text,                                   -- fundacion | iglesia | universidad | municipio | empresa | diaspora | otro
  plan text not null default 'gratis',         -- gratis | campana | pro
  plan_vence timestamptz,
  kajabi_email text,                           -- correo con el que pagó (activación automática)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ac_miembros (
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'operador' check (rol in ('admin','operador')),
  nombre text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.ac_invitaciones (
  codigo text primary key,
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  rol text not null default 'operador' check (rol in ('admin','operador')),
  usos int not null default 0,
  max_usos int not null default 100,
  vence timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

-- ---------- Catálogos (org_id null = global, compartido) ----------
create table if not exists public.ac_categorias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.ac_orgs(id) on delete cascade,
  nombre text not null,
  hs_code text,
  orden int not null default 0,
  unique (org_id, nombre)
);

create table if not exists public.ac_hs (
  palabra text primary key,
  hs_code text not null
);

create table if not exists public.ac_diccionario (
  id bigserial primary key,
  org_id uuid references public.ac_orgs(id) on delete cascade,
  original text not null,
  canonica text not null,
  categoria text,
  unique (org_id, original)
);
create index if not exists ac_diccionario_original_idx on public.ac_diccionario (lower(original) text_pattern_ops);
create index if not exists ac_diccionario_canonica_idx on public.ac_diccionario (lower(canonica) text_pattern_ops);

-- ---------- Operación ----------
create table if not exists public.ac_centros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  nombre text not null,
  prefijo text not null,
  direccion text,
  proxima_caja int not null default 1,
  proximo_pallet int not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, prefijo)
);

create table if not exists public.ac_envios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  codigo text not null,
  nombre text,
  destino text,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  unique (org_id, codigo)
);

create table if not exists public.ac_pallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  centro_id uuid not null references public.ac_centros(id) on delete restrict,
  codigo text not null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  largo_cm numeric, ancho_cm numeric, alto_cm numeric,
  tara_kg numeric not null default 0,
  operador_nombre text,
  envio_id uuid references public.ac_envios(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cerrado_at timestamptz,
  unique (org_id, codigo)
);

create table if not exists public.ac_cajas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  centro_id uuid not null references public.ac_centros(id) on delete restrict,
  codigo text not null,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada','paletizada')),
  peso_kg numeric,
  operador_nombre text,
  pallet_id uuid references public.ac_pallets(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cerrada_at timestamptz,
  unique (org_id, codigo)
);
create index if not exists ac_cajas_org_idx on public.ac_cajas (org_id, created_at desc);
create index if not exists ac_cajas_pallet_idx on public.ac_cajas (pallet_id);

create table if not exists public.ac_items (
  id bigserial primary key,
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  caja_id uuid not null references public.ac_cajas(id) on delete cascade,
  cantidad numeric not null check (cantidad > 0),
  descripcion text not null,
  canonica text,
  marca text,
  unidad text,
  categoria text,
  valor_unitario numeric,
  created_at timestamptz not null default now()
);
create index if not exists ac_items_caja_idx on public.ac_items (caja_id);
create index if not exists ac_items_org_idx on public.ac_items (org_id);

create table if not exists public.ac_incidencias (
  id bigserial primary key,
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  tipo text not null,                          -- caja_inexistente | caja_ya_paletizada | pallet_cerrado | otro
  pallet_codigo text,
  caja_codigo text,
  detalle text,
  resuelta boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ac_leads (
  id bigserial primary key,
  nombre text, email text, whatsapp text, organizacion text, pais text, tipo text,
  cuando text, origen text, utm jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Helpers de seguridad ----------
create or replace function public.ac_es_miembro(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ac_miembros where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.ac_es_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ac_miembros where org_id = p_org and user_id = auth.uid() and rol = 'admin');
$$;

-- ---------- RLS ----------
alter table public.ac_orgs enable row level security;
alter table public.ac_miembros enable row level security;
alter table public.ac_invitaciones enable row level security;
alter table public.ac_categorias enable row level security;
alter table public.ac_hs enable row level security;
alter table public.ac_diccionario enable row level security;
alter table public.ac_centros enable row level security;
alter table public.ac_envios enable row level security;
alter table public.ac_pallets enable row level security;
alter table public.ac_cajas enable row level security;
alter table public.ac_items enable row level security;
alter table public.ac_incidencias enable row level security;
alter table public.ac_leads enable row level security;

drop policy if exists orgs_miembro on public.ac_orgs;
create policy orgs_miembro on public.ac_orgs for select using (public.ac_es_miembro(id));
drop policy if exists orgs_admin_upd on public.ac_orgs;
create policy orgs_admin_upd on public.ac_orgs for update using (public.ac_es_admin(id)) with check (public.ac_es_admin(id));

drop policy if exists miembros_ver on public.ac_miembros;
create policy miembros_ver on public.ac_miembros for select using (public.ac_es_miembro(org_id));
drop policy if exists miembros_admin on public.ac_miembros;
create policy miembros_admin on public.ac_miembros for all using (public.ac_es_admin(org_id)) with check (public.ac_es_admin(org_id));

drop policy if exists invit_admin on public.ac_invitaciones;
create policy invit_admin on public.ac_invitaciones for all using (public.ac_es_admin(org_id)) with check (public.ac_es_admin(org_id));

drop policy if exists cat_ver on public.ac_categorias;
create policy cat_ver on public.ac_categorias for select using (org_id is null or public.ac_es_miembro(org_id));
drop policy if exists cat_admin on public.ac_categorias;
create policy cat_admin on public.ac_categorias for all using (org_id is not null and public.ac_es_admin(org_id)) with check (org_id is not null and public.ac_es_admin(org_id));

drop policy if exists hs_ver on public.ac_hs;
create policy hs_ver on public.ac_hs for select using (auth.role() = 'authenticated');

drop policy if exists dic_ver on public.ac_diccionario;
create policy dic_ver on public.ac_diccionario for select using (org_id is null or public.ac_es_miembro(org_id));
drop policy if exists dic_org on public.ac_diccionario;
create policy dic_org on public.ac_diccionario for insert with check (org_id is not null and public.ac_es_miembro(org_id));
drop policy if exists dic_org_upd on public.ac_diccionario;
create policy dic_org_upd on public.ac_diccionario for update using (org_id is not null and public.ac_es_admin(org_id));

-- tablas operativas: miembros leen y escriben; solo admin borra
do $$
declare t text;
begin
  foreach t in array array['ac_centros','ac_envios','ac_pallets','ac_cajas','ac_items','ac_incidencias'] loop
    execute format('drop policy if exists %1$s_sel on public.%1$s; create policy %1$s_sel on public.%1$s for select using (public.ac_es_miembro(org_id));', t);
    execute format('drop policy if exists %1$s_ins on public.%1$s; create policy %1$s_ins on public.%1$s for insert with check (public.ac_es_miembro(org_id));', t);
    execute format('drop policy if exists %1$s_upd on public.%1$s; create policy %1$s_upd on public.%1$s for update using (public.ac_es_miembro(org_id)) with check (public.ac_es_miembro(org_id));', t);
    execute format('drop policy if exists %1$s_del on public.%1$s; create policy %1$s_del on public.%1$s for delete using (public.ac_es_admin(org_id));', t);
  end loop;
end $$;

-- leads: nadie los lee desde el navegador; los escribe n8n con service role
-- (sin políticas = bloqueado para anon/authenticated)

-- ---------- Límites por plan ----------
create or replace function public.ac_limites(p_plan text)
returns table (max_cajas int, max_centros int, max_envios int) language sql immutable as $$
  select case p_plan when 'gratis' then 150 else 1000000 end,
         case p_plan when 'gratis' then 1 else 1000 end,
         case p_plan when 'gratis' then 1 else 1000 end;
$$;

create or replace function public.ac_plan_vigente(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when plan <> 'gratis' and (plan_vence is null or plan_vence > now()) then plan else 'gratis' end
  from public.ac_orgs where id = p_org;
$$;

-- ---------- RPCs ----------
-- Crear organización + membresía admin + primer centro (onboarding)
create or replace function public.ac_crear_org(p_nombre text, p_pais text, p_tipo text, p_centro text, p_prefijo text, p_mi_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_pref text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  v_pref := upper(regexp_replace(coalesce(p_prefijo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_pref) < 1 or length(v_pref) > 4 then raise exception 'El prefijo debe tener entre 1 y 4 letras o números'; end if;
  insert into public.ac_orgs (nombre, pais, tipo, created_by) values (p_nombre, p_pais, p_tipo, auth.uid()) returning id into v_org;
  insert into public.ac_miembros (org_id, user_id, rol, nombre) values (v_org, auth.uid(), 'admin', p_mi_nombre);
  insert into public.ac_centros (org_id, nombre, prefijo) values (v_org, coalesce(nullif(p_centro,''), 'Bodega principal'), v_pref);
  return v_org;
end $$;

-- Unirse con código de invitación
create or replace function public.ac_unirse(p_codigo text, p_mi_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v inv record;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v from public.ac_invitaciones where codigo = upper(trim(p_codigo));
  if not found then raise exception 'Código de invitación no existe'; end if;
  if v.vence < now() or v.usos >= v.max_usos then raise exception 'Código vencido'; end if;
  insert into public.ac_miembros (org_id, user_id, rol, nombre) values (v.org_id, auth.uid(), v.rol, p_mi_nombre)
    on conflict (org_id, user_id) do update set nombre = excluded.nombre;
  update public.ac_invitaciones set usos = usos + 1 where codigo = v.codigo;
  return v.org_id;
end $$;

-- Crear invitación (admin)
create or replace function public.ac_crear_invitacion(p_org uuid, p_rol text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  if not public.ac_es_admin(p_org) then raise exception 'Solo administradores'; end if;
  v_cod := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 6));
  insert into public.ac_invitaciones (codigo, org_id, rol) values (v_cod, p_org, coalesce(p_rol,'operador'));
  return v_cod;
end $$;

-- Crear centro (respeta límite del plan)
create or replace function public.ac_crear_centro(p_org uuid, p_nombre text, p_prefijo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int; v_max int; v_pref text;
begin
  if not public.ac_es_admin(p_org) then raise exception 'Solo administradores'; end if;
  select max_centros into v_max from public.ac_limites(public.ac_plan_vigente(p_org));
  select count(*) into v_n from public.ac_centros where org_id = p_org and activo;
  if v_n >= v_max then raise exception 'PLAN_LIMITE: el plan gratis permite 1 bodega. Activa Campaña o Pro para más.'; end if;
  v_pref := upper(regexp_replace(coalesce(p_prefijo,''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_pref) < 1 or length(v_pref) > 4 then raise exception 'El prefijo debe tener entre 1 y 4 letras o números'; end if;
  insert into public.ac_centros (org_id, nombre, prefijo) values (p_org, p_nombre, v_pref) returning id into v_id;
  return v_id;
end $$;

-- Crear caja con correlativo atómico por centro (respeta límite del plan)
create or replace function public.ac_crear_caja(p_centro uuid, p_operador text)
returns table (id uuid, codigo text) language plpgsql security definer set search_path = public as $$
declare c record; v_n int; v_max int; v_cod text; v_id uuid;
begin
  select * into c from public.ac_centros where ac_centros.id = p_centro for update;
  if not found or not public.ac_es_miembro(c.org_id) then raise exception 'Centro no válido'; end if;
  select max_cajas into v_max from public.ac_limites(public.ac_plan_vigente(c.org_id));
  select count(*) into v_n from public.ac_cajas where org_id = c.org_id;
  if v_n >= v_max then raise exception 'PLAN_LIMITE: llegaste a las % cajas del plan gratis. Activa Campaña o Pro para seguir.', v_max; end if;
  v_cod := c.prefijo || '-' || lpad(c.proxima_caja::text, 4, '0');
  update public.ac_centros set proxima_caja = proxima_caja + 1 where ac_centros.id = p_centro;
  insert into public.ac_cajas (org_id, centro_id, codigo, operador_nombre, created_by)
    values (c.org_id, p_centro, v_cod, p_operador, auth.uid()) returning ac_cajas.id into v_id;
  return query select v_id, v_cod;
end $$;

-- Crear pallet con correlativo atómico por centro
create or replace function public.ac_crear_pallet(p_centro uuid, p_operador text)
returns table (id uuid, codigo text) language plpgsql security definer set search_path = public as $$
declare c record; v_cod text; v_id uuid;
begin
  select * into c from public.ac_centros where ac_centros.id = p_centro for update;
  if not found or not public.ac_es_miembro(c.org_id) then raise exception 'Centro no válido'; end if;
  v_cod := 'PAL-' || c.prefijo || '-' || lpad(c.proximo_pallet::text, 3, '0');
  update public.ac_centros set proximo_pallet = proximo_pallet + 1 where ac_centros.id = p_centro;
  insert into public.ac_pallets (org_id, centro_id, codigo, operador_nombre, created_by)
    values (c.org_id, p_centro, v_cod, p_operador, auth.uid()) returning ac_pallets.id into v_id;
  return query select v_id, v_cod;
end $$;

-- Asignar caja a pallet con validación (las 3 incidencias reales del acopio original)
create or replace function public.ac_paletizar(p_pallet uuid, p_caja_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare p record; cj record; v_cod text;
begin
  select * into p from public.ac_pallets where id = p_pallet;
  if not found or not public.ac_es_miembro(p.org_id) then raise exception 'Pallet no válido'; end if;
  if p.estado = 'cerrado' then
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'pallet_cerrado', p.codigo, p_caja_codigo, 'Se intentó agregar una caja a un pallet cerrado', auth.uid());
    raise exception 'El pallet % está cerrado', p.codigo;
  end if;
  v_cod := upper(trim(p_caja_codigo));
  select * into cj from public.ac_cajas where org_id = p.org_id and codigo = v_cod;
  if not found then
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'caja_inexistente', p.codigo, v_cod, 'La caja no existe en el sistema', auth.uid());
    raise exception 'La caja % no existe en el sistema', v_cod;
  end if;
  if cj.pallet_id is not null and cj.pallet_id <> p_pallet then
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'caja_ya_paletizada', p.codigo, v_cod,
        'La caja ya fue asignada al pallet ' || (select codigo from public.ac_pallets where id = cj.pallet_id), auth.uid());
    raise exception 'La caja % ya está en el pallet %', v_cod, (select codigo from public.ac_pallets where id = cj.pallet_id);
  end if;
  if cj.pallet_id = p_pallet then
    return json_build_object('ok', true, 'repetida', true, 'caja', cj.codigo);
  end if;
  update public.ac_cajas set pallet_id = p_pallet, estado = 'paletizada' where id = cj.id;
  return json_build_object('ok', true, 'caja', cj.codigo, 'peso', cj.peso_kg,
    'items', (select count(*) from public.ac_items where caja_id = cj.id));
end $$;

-- Quitar caja de pallet
create or replace function public.ac_despaletizar(p_caja uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cj record; p record;
begin
  select * into cj from public.ac_cajas where id = p_caja;
  if not found or not public.ac_es_miembro(cj.org_id) then raise exception 'Caja no válida'; end if;
  if cj.pallet_id is not null then
    select * into p from public.ac_pallets where id = cj.pallet_id;
    if p.estado = 'cerrado' then raise exception 'El pallet % está cerrado; ábrelo primero', p.codigo; end if;
  end if;
  update public.ac_cajas set pallet_id = null, estado = 'cerrada' where id = p_caja;
end $$;

-- Panel de control (mismos KPIs del acopio original)
create or replace function public.ac_panel(p_org uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'cajas', (select count(*) from public.ac_cajas where org_id = p_org),
    'cajas_paletizadas', (select count(*) from public.ac_cajas where org_id = p_org and pallet_id is not null),
    'cajas_sin_paletizar', (select count(*) from public.ac_cajas where org_id = p_org and pallet_id is null),
    'pallets_cerrados', (select count(*) from public.ac_pallets where org_id = p_org and estado = 'cerrado'),
    'pallets_abiertos', (select count(*) from public.ac_pallets where org_id = p_org and estado = 'abierto'),
    'items', (select coalesce(sum(cantidad),0) from public.ac_items where org_id = p_org),
    'lineas', (select count(*) from public.ac_items where org_id = p_org),
    'peso_paletizado', (select coalesce(sum(peso_kg),0) from public.ac_cajas where org_id = p_org and pallet_id is not null),
    'envios', (select count(*) from public.ac_envios where org_id = p_org),
    'incidencias', (select count(*) from public.ac_incidencias where org_id = p_org and not resuelta),
    'por_centro', (select coalesce(json_agg(json_build_object('centro', c.nombre, 'prefijo', c.prefijo,
        'cajas', (select count(*) from public.ac_cajas x where x.centro_id = c.id),
        'pallets_cerrados', (select count(*) from public.ac_pallets x where x.centro_id = c.id and x.estado='cerrado'),
        'pallets_abiertos', (select count(*) from public.ac_pallets x where x.centro_id = c.id and x.estado='abierto'),
        'peso', (select coalesce(sum(peso_kg),0) from public.ac_cajas x where x.centro_id = c.id and x.pallet_id is not null)
      ) order by c.nombre), '[]'::json) from public.ac_centros c where c.org_id = p_org and c.activo),
    'por_categoria', (select coalesce(json_agg(json_build_object('categoria', categoria, 'items', s, 'lineas', n) order by s desc), '[]'::json)
        from (select coalesce(categoria,'Sin categoría') categoria, sum(cantidad) s, count(*) n from public.ac_items where org_id = p_org group by 1) q),
    'por_envio', (select coalesce(json_agg(json_build_object('codigo', e.codigo, 'nombre', e.nombre, 'estado', e.estado, 'fecha', e.fecha,
        'pallets', (select count(*) from public.ac_pallets p where p.envio_id = e.id),
        'cajas', (select count(*) from public.ac_cajas cj join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id),
        'items', (select coalesce(sum(i.cantidad),0) from public.ac_items i join public.ac_cajas cj on cj.id = i.caja_id join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id),
        'peso', (select coalesce(sum(cj.peso_kg),0) + coalesce(sum(distinct p.tara_kg),0) from public.ac_cajas cj join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id)
      ) order by e.fecha desc), '[]'::json) from public.ac_envios e where e.org_id = p_org),
    'actualizado', now()
  );
$$;

-- Sugerir canónica + categoría para una descripción (diccionario org → global → HS por palabra clave)
create or replace function public.ac_sugerir(p_org uuid, p_texto text, p_limite int default 8)
returns table (canonica text, categoria text, fuente text) language sql stable security definer set search_path = public as $$
  with q as (select lower(trim(p_texto)) t)
  select d.canonica, d.categoria, case when d.org_id is null then 'global' else 'org' end
  from public.ac_diccionario d, q
  where (d.org_id = p_org or d.org_id is null)
    and (lower(d.original) like q.t || '%' or lower(d.canonica) like q.t || '%')
  group by d.canonica, d.categoria, d.org_id
  order by (d.org_id is not null) desc, length(d.canonica)
  limit p_limite;
$$;

-- Activar plan (lo llama n8n con service role tras la compra en Kajabi)
create or replace function public.ac_activar_plan(p_org uuid, p_plan text, p_dias int, p_email text)
returns void language sql security definer set search_path = public as $$
  update public.ac_orgs set plan = p_plan, plan_vence = now() + make_interval(days => p_dias), kajabi_email = p_email where id = p_org;
$$;
revoke execute on function public.ac_activar_plan(uuid, text, int, text) from anon, authenticated;

-- Packing list de un envío (para aduana: con HS por categoría/palabra y valores)
create or replace function public.ac_packing_envio(p_envio uuid)
returns table (pallet text, caja text, peso_caja numeric, cantidad numeric, descripcion text, canonica text, marca text, unidad text, categoria text, hs_code text, valor_unitario numeric)
language sql stable security definer set search_path = public as $$
  select p.codigo, cj.codigo, cj.peso_kg, i.cantidad, i.descripcion, i.canonica, i.marca, i.unidad, i.categoria,
    coalesce(
      (select h.hs_code from public.ac_hs h where position(h.palabra in lower(coalesce(i.canonica, i.descripcion))) > 0 order by length(h.palabra) desc limit 1),
      (select h.hs_code from public.ac_hs h where lower(h.palabra) = lower(coalesce(i.categoria,'')) limit 1),
      (select c.hs_code from public.ac_categorias c where c.nombre = i.categoria and c.hs_code is not null limit 1)
    ),
    i.valor_unitario
  from public.ac_envios e
  join public.ac_pallets p on p.envio_id = e.id
  join public.ac_cajas cj on cj.pallet_id = p.id
  join public.ac_items i on i.caja_id = cj.id
  where e.id = p_envio and public.ac_es_miembro(e.org_id)
  order by p.codigo, cj.codigo, i.id;
$$;
