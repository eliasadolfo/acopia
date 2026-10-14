-- Configuración privada (sin políticas = solo service role / funciones security definer)
create table if not exists public.ac_config (clave text primary key, valor text not null);
alter table public.ac_config enable row level security;
-- El token real se inyecta al migrar (ver README): nunca se versiona.
insert into public.ac_config (clave, valor) values ('token_activacion', 'CAMBIAR_AL_MIGRAR')
  on conflict (clave) do nothing;

-- Leads de la landing: cualquiera puede insertar (vía n8n o directo), nadie lee desde el navegador
drop policy if exists leads_insert_anon on public.ac_leads;
create policy leads_insert_anon on public.ac_leads for insert to anon, authenticated with check (true);

-- Activar plan por correo del comprador (lo llama n8n con cabecera x-acopia-token)
create or replace function public.ac_activar_por_email(p_email text, p_plan text, p_dias int)
returns json language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text; v_n int := 0; v_ids uuid[];
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  if v_tok is null or v_hdr <> v_tok then raise exception 'No autorizado'; end if;
  if p_plan not in ('campana','pro') then raise exception 'Plan inválido'; end if;
  select array_agg(distinct m.org_id) into v_ids
  from public.ac_miembros m join auth.users u on u.id = m.user_id
  where m.rol = 'admin' and lower(u.email) = lower(trim(p_email));
  if v_ids is null then return json_build_object('ok', false, 'motivo', 'sin_org', 'email', p_email); end if;
  update public.ac_orgs set plan = p_plan, kajabi_email = p_email,
    plan_vence = greatest(coalesce(plan_vence, now()), now()) + make_interval(days => p_dias)
  where id = any(v_ids);
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'orgs', v_n, 'plan', p_plan, 'email', p_email);
end $$;
grant execute on function public.ac_activar_por_email(text, text, int) to anon, authenticated;

-- Lista de admins con correo (para avisos de n8n), protegida por el mismo token
create or replace function public.ac_admins_por_org(p_org uuid)
returns table (email text, nombre text) language plpgsql security definer set search_path = public as $$
declare v_tok text; v_hdr text;
begin
  select valor into v_tok from public.ac_config where clave = 'token_activacion';
  v_hdr := coalesce(current_setting('request.headers', true)::json->>'x-acopia-token', '');
  if v_tok is null or v_hdr <> v_tok then raise exception 'No autorizado'; end if;
  return query select u.email::text, m.nombre from public.ac_miembros m join auth.users u on u.id = m.user_id where m.org_id = p_org and m.rol = 'admin';
end $$;
grant execute on function public.ac_admins_por_org(uuid) to anon, authenticated;
