update public.ac_orgs set plan = 'bodega' where plan in ('anual','pro');
update public.ac_orgs set plan = 'temporada' where plan = 'campana';

drop function if exists public.ac_limites(text);
create function public.ac_limites(p_plan text)
returns table (max_cajas int, max_centros int, max_envios int, max_miembros int) language sql stable as $$
  select
    case when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 150 else 1000000 end,
    case when p_plan = 'emprendedor' then 1
         when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else 1000 end,
    case when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else 1000 end,
    case when p_plan = 'emprendedor' then 3 else 100000 end;
$$;

create or replace function public.ac_unirse(p_codigo text, p_mi_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v record; v_n int; v_max int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v from public.ac_invitaciones where codigo = upper(trim(p_codigo));
  if not found then raise exception 'Código de invitación no existe'; end if;
  if v.vence < now() or v.usos >= v.max_usos then raise exception 'Código vencido'; end if;
  select max_miembros into v_max from public.ac_limites(public.ac_plan_vigente(v.org_id));
  select count(*) into v_n from public.ac_miembros where org_id = v.org_id;
  if v_n >= v_max and not exists (select 1 from public.ac_miembros where org_id = v.org_id and user_id = auth.uid()) then
    raise exception 'PLAN_LIMITE: el plan Emprendedor permite hasta % usuarios. Pasa a Bodega para equipo ilimitado.', v_max;
  end if;
  insert into public.ac_miembros (org_id, user_id, rol, nombre) values (v.org_id, auth.uid(), v.rol, p_mi_nombre)
    on conflict (org_id, user_id) do update set nombre = excluded.nombre;
  update public.ac_invitaciones set usos = usos + 1 where codigo = v.codigo;
  return v.org_id;
end $$;

create or replace function public.ac_activar_por_email(p_email text, p_plan text, p_dias int)
returns json language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text; v_n int := 0; v_ids uuid[]; v_plan text;
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  if v_tok is null or v_hdr <> v_tok then raise exception 'No autorizado'; end if;
  v_plan := case p_plan when 'campana' then 'temporada' when 'pro' then 'bodega' when 'anual' then 'bodega' else p_plan end;
  if v_plan not in ('emprendedor','bodega','temporada') then raise exception 'Plan inválido'; end if;
  select array_agg(distinct m.org_id) into v_ids
  from public.ac_miembros m join auth.users u on u.id = m.user_id
  where m.rol = 'admin' and lower(u.email) = lower(trim(p_email));
  if v_ids is null then return json_build_object('ok', false, 'motivo', 'sin_org', 'email', p_email); end if;
  update public.ac_orgs set plan = v_plan, kajabi_email = p_email,
    plan_vence = greatest(coalesce(plan_vence, now()), now()) + make_interval(days => p_dias)
  where id = any(v_ids);
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'orgs', v_n, 'plan', v_plan, 'email', p_email);
end $$;

create or replace function public.ac_admin_activar(p_email text, p_plan text, p_dias int)
returns json language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_ids uuid[];
begin
  if not public.ac_soy_superadmin() then raise exception 'Solo el administrador'; end if;
  if p_plan not in ('gratis','emprendedor','bodega','temporada','comunidad') then raise exception 'Plan inválido'; end if;
  select array_agg(distinct m.org_id) into v_ids
  from public.ac_miembros m join auth.users u on u.id = m.user_id
  where m.rol = 'admin' and lower(u.email) = lower(trim(p_email));
  if v_ids is null then return json_build_object('ok', false, 'motivo', 'sin_org'); end if;
  if p_plan = 'gratis' then
    update public.ac_orgs set plan = 'gratis', plan_vence = null where id = any(v_ids);
  else
    update public.ac_orgs set plan = p_plan, kajabi_email = p_email,
      plan_vence = greatest(coalesce(plan_vence, now()), now()) + make_interval(days => p_dias) where id = any(v_ids);
  end if;
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'orgs', v_n);
end $$;

-- Memoria de conversación de Lía (correo y chat en la app). Acceso solo por RPC con token (n8n) o sesión (app).
create table if not exists public.ac_chat (
  id bigserial primary key,
  clave text not null,                      -- 'mail:correo' o 'app:user_id'
  rol text not null check (rol in ('user','assistant')),
  texto text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ac_chat_clave_idx on public.ac_chat (clave, created_at desc);
alter table public.ac_chat enable row level security;
create table if not exists public.ac_chat_contactos (
  clave text primary key,
  nombre text, correo text, negocio text, rubro text, pais text, etapa text default 'nuevo', notas text,
  presentada boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.ac_chat_contactos enable row level security;

create or replace function public.ac_chat_leer(p_clave text, p_limite int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text; v_mi text;
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  v_mi := 'app:' || coalesce(auth.uid()::text, '');
  if v_hdr <> coalesce(v_tok, '') and p_clave <> v_mi then raise exception 'No autorizado'; end if;
  return json_build_object(
    'contacto', (select row_to_json(c) from public.ac_chat_contactos c where c.clave = p_clave),
    'mensajes', (select coalesce(json_agg(json_build_object('rol', rol, 'texto', texto, 'fecha', created_at) order by created_at), '[]'::json)
                 from (select * from public.ac_chat where clave = p_clave order by created_at desc limit p_limite) q)
  );
end $$;
grant execute on function public.ac_chat_leer(text, int) to anon, authenticated;

create or replace function public.ac_chat_guardar(p_clave text, p_rol text, p_texto text, p_meta jsonb default null, p_contacto jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text; v_mi text;
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  v_mi := 'app:' || coalesce(auth.uid()::text, '');
  if v_hdr <> coalesce(v_tok, '') and p_clave <> v_mi then raise exception 'No autorizado'; end if;
  if p_rol not in ('user','assistant') then raise exception 'Rol inválido'; end if;
  insert into public.ac_chat (clave, rol, texto, meta) values (p_clave, p_rol, left(p_texto, 6000), p_meta);
  if p_contacto is not null then
    insert into public.ac_chat_contactos (clave, nombre, correo, negocio, rubro, pais, etapa, notas, presentada, updated_at)
    values (p_clave, p_contacto->>'nombre', p_contacto->>'correo', p_contacto->>'negocio', p_contacto->>'rubro', p_contacto->>'pais', coalesce(p_contacto->>'etapa','nuevo'), p_contacto->>'notas', coalesce((p_contacto->>'presentada')::boolean, false), now())
    on conflict (clave) do update set
      nombre = coalesce(nullif(excluded.nombre,''), ac_chat_contactos.nombre), correo = coalesce(nullif(excluded.correo,''), ac_chat_contactos.correo),
      negocio = coalesce(nullif(excluded.negocio,''), ac_chat_contactos.negocio), rubro = coalesce(nullif(excluded.rubro,''), ac_chat_contactos.rubro),
      pais = coalesce(nullif(excluded.pais,''), ac_chat_contactos.pais), etapa = coalesce(nullif(excluded.etapa,''), ac_chat_contactos.etapa),
      notas = coalesce(nullif(excluded.notas,''), ac_chat_contactos.notas), presentada = ac_chat_contactos.presentada or excluded.presentada, updated_at = now();
  end if;
end $$;
grant execute on function public.ac_chat_guardar(text, text, text, jsonb, jsonb) to anon, authenticated;

-- Estado de la cuenta para que Lía guíe paso a paso (la app lo llama con la sesión del usuario)
create or replace function public.ac_mi_estado()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'email', auth.jwt()->>'email',
    'orgs', (select coalesce(json_agg(json_build_object(
        'org', o.nombre, 'tipo', o.tipo, 'pais', o.pais, 'plan', public.ac_plan_vigente(o.id), 'rol', m.rol, 'miembros', (select count(*) from public.ac_miembros x where x.org_id = o.id),
        'bodegas', (select count(*) from public.ac_centros x where x.org_id = o.id and x.activo),
        'cajas', (select count(*) from public.ac_cajas x where x.org_id = o.id),
        'cajas_con_items', (select count(distinct i.caja_id) from public.ac_items i where i.org_id = o.id),
        'pallets', (select count(*) from public.ac_pallets x where x.org_id = o.id),
        'pallets_cerrados', (select count(*) from public.ac_pallets x where x.org_id = o.id and x.estado = 'cerrado'),
        'envios', (select count(*) from public.ac_envios x where x.org_id = o.id),
        'envios_cerrados', (select count(*) from public.ac_envios x where x.org_id = o.id and x.estado = 'cerrado'),
        'incidencias_abiertas', (select count(*) from public.ac_incidencias x where x.org_id = o.id and not x.resuelta),
        'creada', o.created_at)), '[]'::json)
      from public.ac_miembros m join public.ac_orgs o on o.id = m.org_id where m.user_id = auth.uid())
  );
$$;
grant execute on function public.ac_mi_estado() to authenticated;
