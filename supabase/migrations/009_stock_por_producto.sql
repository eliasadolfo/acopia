-- Stock por producto: suma de ítems en cajas que todavía no salieron en un despacho cerrado (lo que hay en bodega)
create or replace function public.ac_stock(p_org uuid, p_centro uuid default null)
returns table (producto text, categoria text, cantidad numeric, cajas bigint, en_pallet numeric, sin_pallet numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(i.canonica,''), i.descripcion) as producto,
         coalesce(i.categoria, 'Sin categoría') as categoria,
         sum(i.cantidad) as cantidad,
         count(distinct i.caja_id) as cajas,
         sum(case when cj.pallet_id is not null then i.cantidad else 0 end) as en_pallet,
         sum(case when cj.pallet_id is null then i.cantidad else 0 end) as sin_pallet
  from public.ac_items i
  join public.ac_cajas cj on cj.id = i.caja_id
  left join public.ac_pallets p on p.id = cj.pallet_id
  left join public.ac_envios e on e.id = p.envio_id
  where i.org_id = p_org and public.ac_es_miembro(p_org)
    and (p_centro is null or cj.centro_id = p_centro)
    and (e.id is null or e.estado <> 'cerrado')
  group by 1, 2
  order by cantidad desc;
$$;
grant execute on function public.ac_stock(uuid, uuid) to authenticated;
