-- Modelo de oferta configurable sin redeploy:
--   'despacho' = gratis sin límites para registrar/paletizar; se paga al cerrar un envío y sacar documentos (lanzamiento)
--   'tope'     = gratis con tope de 150 cajas / 1 bodega / 1 envío (variante de control)
insert into public.ac_config (clave, valor) values ('oferta', 'despacho') on conflict (clave) do update set valor = excluded.valor;

create or replace function public.ac_oferta()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'oferta', coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho'),
    'gratis_max_cajas', case when coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 150 else null end,
    'gratis_max_centros', case when coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else null end,
    'gratis_max_envios', case when coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else null end,
    'gratis_puede_despachar', coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope'
  );
$$;
grant execute on function public.ac_oferta() to anon, authenticated;

create or replace function public.ac_limites(p_plan text)
returns table (max_cajas int, max_centros int, max_envios int) language sql stable as $$
  select case when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 150 else 1000000 end,
         case when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else 1000 end,
         case when p_plan = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'tope' then 1 else 1000 end;
$$;

-- Cerrar un envío (y con ello los documentos de aduana) requiere plan pagado en el modelo 'despacho'
create or replace function public.ac_envio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cerrado' and (tg_op = 'INSERT' or old.estado <> 'cerrado') then
    if public.ac_plan_vigente(new.org_id) = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'despacho' then
      raise exception 'PLAN_LIMITE: para cerrar el envío y descargar los documentos activa el plan Campaña (US$97 por 90 días) o Pro.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ac_envio_guard_trg on public.ac_envios;
create trigger ac_envio_guard_trg before insert or update on public.ac_envios for each row execute function public.ac_envio_guard();

-- Packing list: en modelo 'despacho' solo con plan pagado
create or replace function public.ac_packing_envio(p_envio uuid)
returns table (pallet text, caja text, peso_caja numeric, cantidad numeric, descripcion text, canonica text, marca text, unidad text, categoria text, hs_code text, valor_unitario numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.ac_envios where id = p_envio;
  if v_org is null or not public.ac_es_miembro(v_org) then raise exception 'Envío no válido'; end if;
  if public.ac_plan_vigente(v_org) = 'gratis' and coalesce((select valor from public.ac_config where clave = 'oferta'), 'despacho') = 'despacho' then
    raise exception 'PLAN_LIMITE: los documentos del envío se descargan con el plan Campaña o Pro.';
  end if;
  return query
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
  where e.id = p_envio
  order by p.codigo, cj.codigo, i.id;
end $$;

-- Resumen del envío sin documentos (lo ve el plan gratis: cuántos pallets/cajas/ítems/peso) para mostrar valor antes de pagar
create or replace function public.ac_envio_resumen(p_envio uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pallets', (select count(*) from public.ac_pallets p where p.envio_id = e.id),
    'cajas', (select count(distinct cj.id) from public.ac_cajas cj join public.ac_pallets p on p.id = cj.pallet_id join public.ac_items i on i.caja_id = cj.id where p.envio_id = e.id),
    'items', (select coalesce(sum(i.cantidad),0) from public.ac_items i join public.ac_cajas cj on cj.id = i.caja_id join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id),
    'lineas', (select count(*) from public.ac_items i join public.ac_cajas cj on cj.id = i.caja_id join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id),
    'peso', (select coalesce(sum(cj.peso_kg),0) from public.ac_cajas cj join public.ac_pallets p on p.id = cj.pallet_id where p.envio_id = e.id) + (select coalesce(sum(p.tara_kg),0) from public.ac_pallets p where p.envio_id = e.id)
  ) from public.ac_envios e where e.id = p_envio and public.ac_es_miembro(e.org_id);
$$;
