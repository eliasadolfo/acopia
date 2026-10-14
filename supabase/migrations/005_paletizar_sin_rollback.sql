-- Las incidencias deben quedar registradas: por eso ya no se lanza excepción (que revertía el insert); se devuelve ok=false.
create or replace function public.ac_paletizar(p_pallet uuid, p_caja_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare p record; cj record; v_cod text; v_items int; v_otro text;
begin
  select * into p from public.ac_pallets where id = p_pallet;
  if not found or not public.ac_es_miembro(p.org_id) then raise exception 'Pallet no válido'; end if;
  v_cod := upper(trim(p_caja_codigo));
  if p.estado = 'cerrado' then
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'pallet_cerrado', p.codigo, v_cod, 'Se intentó agregar una caja a un pallet cerrado', auth.uid());
    return json_build_object('ok', false, 'error', 'El pallet ' || p.codigo || ' está cerrado');
  end if;
  select * into cj from public.ac_cajas where org_id = p.org_id and codigo = v_cod;
  if not found then
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'caja_inexistente', p.codigo, v_cod, 'La caja no existe en el sistema', auth.uid());
    return json_build_object('ok', false, 'error', 'La caja ' || v_cod || ' no existe en el sistema');
  end if;
  if cj.pallet_id = p_pallet then
    return json_build_object('ok', true, 'repetida', true, 'caja', cj.codigo);
  end if;
  if cj.pallet_id is not null then
    select codigo into v_otro from public.ac_pallets where id = cj.pallet_id;
    insert into public.ac_incidencias (org_id, tipo, pallet_codigo, caja_codigo, detalle, created_by)
      values (p.org_id, 'caja_ya_paletizada', p.codigo, v_cod, 'La caja ya fue asignada al pallet ' || v_otro, auth.uid());
    return json_build_object('ok', false, 'error', 'La caja ' || v_cod || ' ya está en el pallet ' || v_otro);
  end if;
  select count(*) into v_items from public.ac_items where caja_id = cj.id;
  if v_items = 0 then
    return json_build_object('ok', false, 'error', 'La caja ' || v_cod || ' está vacía: registra su contenido antes de paletizar');
  end if;
  update public.ac_cajas set pallet_id = p_pallet, estado = 'paletizada', cerrada_at = coalesce(cerrada_at, now()) where id = cj.id;
  return json_build_object('ok', true, 'caja', cj.codigo, 'peso', cj.peso_kg, 'items', v_items);
end $$;
