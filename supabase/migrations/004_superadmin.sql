insert into public.ac_config (clave, valor) values ('superadmin_email', 'elias@tuescuelademarcas.cl') on conflict (clave) do update set valor = excluded.valor;

create or replace function public.ac_soy_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = (select lower(valor) from public.ac_config where clave = 'superadmin_email');
$$;

create or replace function public.ac_admin_activar(p_email text, p_plan text, p_dias int)
returns json language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_ids uuid[];
begin
  if not public.ac_soy_superadmin() then raise exception 'Solo el administrador de Acopia'; end if;
  if p_plan not in ('gratis','campana','pro') then raise exception 'Plan inválido'; end if;
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

create or replace function public.ac_admin_orgs()
returns table (org_id uuid, nombre text, pais text, tipo text, plan text, plan_vence timestamptz, created_at timestamptz, admin_email text, admin_nombre text, cajas bigint, miembros bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.ac_soy_superadmin() then raise exception 'Solo el administrador de Acopia'; end if;
  return query
  select o.id, o.nombre, o.pais, o.tipo, o.plan, o.plan_vence, o.created_at,
    (select u.email::text from public.ac_miembros m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.rol = 'admin' order by m.created_at limit 1),
    (select m.nombre from public.ac_miembros m where m.org_id = o.id and m.rol = 'admin' order by m.created_at limit 1),
    (select count(*) from public.ac_cajas c where c.org_id = o.id),
    (select count(*) from public.ac_miembros m where m.org_id = o.id)
  from public.ac_orgs o order by o.created_at desc;
end $$;

create or replace function public.ac_admin_leads()
returns setof public.ac_leads language plpgsql security definer set search_path = public as $$
begin
  if not public.ac_soy_superadmin() then raise exception 'Solo el administrador de Acopia'; end if;
  return query select * from public.ac_leads order by created_at desc limit 500;
end $$;
