-- Planes nuevos (narrativa bodega/ecommerce): gratis | mensual | temporada | anual | comunidad
-- 'comunidad' = programa gratuito 90 días para emergencias/catástrofes y campañas solidarias (autoservicio, una vez por organización)
update public.ac_orgs set plan = 'temporada' where plan = 'campana';
update public.ac_orgs set plan = 'anual' where plan = 'pro';

create table if not exists public.ac_comunidad (
  id bigserial primary key,
  org_id uuid not null references public.ac_orgs(id) on delete cascade,
  motivo text not null,
  enlace text,
  pais text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id)
);
alter table public.ac_comunidad enable row level security;
drop policy if exists comunidad_ver on public.ac_comunidad;
create policy comunidad_ver on public.ac_comunidad for select using (public.ac_es_miembro(org_id));

create or replace function public.ac_activar_comunidad(p_org uuid, p_motivo text, p_enlace text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.ac_es_admin(p_org) then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_motivo,''))) < 20 then raise exception 'Cuéntanos en una o dos frases qué emergencia o campaña es (mínimo 20 caracteres)'; end if;
  if exists (select 1 from public.ac_comunidad where org_id = p_org) then raise exception 'El programa Comunidad ya se usó en esta organización'; end if;
  insert into public.ac_comunidad (org_id, motivo, enlace, pais, created_by)
    values (p_org, trim(p_motivo), nullif(trim(p_enlace),''), (select pais from public.ac_orgs where id = p_org), auth.uid());
  update public.ac_orgs set plan = 'comunidad', plan_vence = now() + interval '90 days' where id = p_org;
  return json_build_object('ok', true, 'vence', now() + interval '90 days');
end $$;

-- Activación por pago: nombres de plan nuevos (y compatibilidad con los viejos)
create or replace function public.ac_activar_por_email(p_email text, p_plan text, p_dias int)
returns json language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text; v_n int := 0; v_ids uuid[]; v_plan text;
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  if v_tok is null or v_hdr <> v_tok then raise exception 'No autorizado'; end if;
  v_plan := case p_plan when 'campana' then 'temporada' when 'pro' then 'anual' else p_plan end;
  if v_plan not in ('mensual','temporada','anual') then raise exception 'Plan inválido'; end if;
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
  if p_plan not in ('gratis','mensual','temporada','anual','comunidad') then raise exception 'Plan inválido'; end if;
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

-- Mensaje del guard de envíos con los nombres nuevos
create or replace function public.ac_envio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cerrado' and (tg_op = 'INSERT' or old.estado <> 'cerrado') then
    if public.ac_plan_vigente(new.org_id) = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'despacho' then
      raise exception 'PLAN_LIMITE: para cerrar despachos y descargar sus documentos activa un plan (desde US$29 al mes) o el programa Comunidad.';
    end if;
  end if;
  return new;
end $$;

-- Admin: ver solicitudes Comunidad
create or replace function public.ac_admin_comunidad()
returns table (org_id uuid, org text, pais text, motivo text, enlace text, created_at timestamptz, plan_vence timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.ac_soy_superadmin() then raise exception 'Solo el administrador'; end if;
  return query select c.org_id, o.nombre, c.pais, c.motivo, c.enlace, c.created_at, o.plan_vence from public.ac_comunidad c join public.ac_orgs o on o.id = c.org_id order by c.created_at desc;
end $$;
