import { supabase } from './supabase'
import type { Caja, Categoria, Centro, Envio, Incidencia, Item, Miembro, Org, Pallet, Panel } from './supabase'

async function ok<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

// ---------- Organización ----------
export const misMembresias = () => ok<(Miembro & { ac_orgs: Org })[]>(supabase.from('ac_miembros').select('*, ac_orgs(*)'))
export const crearOrg = (p: { nombre: string; pais: string; tipo: string; centro: string; prefijo: string; miNombre: string }) =>
  ok<string>(supabase.rpc('ac_crear_org', { p_nombre: p.nombre, p_pais: p.pais, p_tipo: p.tipo, p_centro: p.centro, p_prefijo: p.prefijo, p_mi_nombre: p.miNombre }))
export const unirse = (codigo: string, miNombre: string) => ok<string>(supabase.rpc('ac_unirse', { p_codigo: codigo, p_mi_nombre: miNombre }))
export const crearInvitacion = (org: string, rol: string) => ok<string>(supabase.rpc('ac_crear_invitacion', { p_org: org, p_rol: rol }))
export const miembros = (org: string) => ok<Miembro[]>(supabase.from('ac_miembros').select('*').eq('org_id', org).order('created_at'))
export const quitarMiembro = (org: string, user: string) => ok(supabase.from('ac_miembros').delete().eq('org_id', org).eq('user_id', user))
export const actualizarOrg = (org: string, p: Partial<Org>) => ok(supabase.from('ac_orgs').update(p).eq('id', org))
export const panel = (org: string) => ok<Panel>(supabase.rpc('ac_panel', { p_org: org }))

// ---------- Centros ----------
export const centros = (org: string) => ok<Centro[]>(supabase.from('ac_centros').select('*').eq('org_id', org).order('nombre'))
export const crearCentro = (org: string, nombre: string, prefijo: string) => ok<string>(supabase.rpc('ac_crear_centro', { p_org: org, p_nombre: nombre, p_prefijo: prefijo }))
export const actualizarCentro = (id: string, p: Partial<Centro>) => ok(supabase.from('ac_centros').update(p).eq('id', id))

// ---------- Catálogos ----------
export const categorias = (org: string) =>
  ok<Categoria[]>(supabase.from('ac_categorias').select('*').or(`org_id.is.null,org_id.eq.${org}`).order('orden'))
export const sugerir = (org: string, texto: string) =>
  ok<{ canonica: string; categoria: string | null; fuente: string }[]>(supabase.rpc('ac_sugerir', { p_org: org, p_texto: texto, p_limite: 8 }))
export const aprenderCanonica = (org: string, original: string, canonica: string, categoria: string | null) =>
  supabase.from('ac_diccionario').upsert({ org_id: org, original, canonica, categoria }, { onConflict: 'org_id,original', ignoreDuplicates: true })

// ---------- Cajas ----------
export const cajas = (org: string, opts: { buscar?: string; centro?: string; estado?: string; limite?: number } = {}) => {
  let q = supabase.from('ac_cajas').select('*').eq('org_id', org).order('created_at', { ascending: false }).limit(opts.limite ?? 200)
  if (opts.centro) q = q.eq('centro_id', opts.centro)
  if (opts.estado) q = q.eq('estado', opts.estado)
  if (opts.buscar) q = q.ilike('codigo', `%${opts.buscar.trim()}%`)
  return ok<Caja[]>(q)
}
export const caja = (id: string) => ok<Caja>(supabase.from('ac_cajas').select('*').eq('id', id).single())
export const cajaPorCodigo = (org: string, codigo: string) => ok<Caja | null>(supabase.from('ac_cajas').select('*').eq('org_id', org).eq('codigo', codigo.toUpperCase().trim()).maybeSingle())
export const crearCaja = (centro: string, operador: string) => ok<{ id: string; codigo: string }[]>(supabase.rpc('ac_crear_caja', { p_centro: centro, p_operador: operador })).then(r => r[0])
export const actualizarCaja = (id: string, p: Partial<Caja>) => ok(supabase.from('ac_cajas').update(p).eq('id', id))
export const borrarCaja = (id: string) => ok(supabase.from('ac_cajas').delete().eq('id', id))
export const items = (cajaId: string) => ok<Item[]>(supabase.from('ac_items').select('*').eq('caja_id', cajaId).order('id'))
export const itemsDeCajas = (ids: string[]) => ok<Item[]>(supabase.from('ac_items').select('*').in('caja_id', ids).order('id'))
export const agregarItem = (it: Omit<Item, 'id'>) => ok<Item>(supabase.from('ac_items').insert(it).select().single())
export const actualizarItem = (id: number, p: Partial<Item>) => ok(supabase.from('ac_items').update(p).eq('id', id))
export const borrarItem = (id: number) => ok(supabase.from('ac_items').delete().eq('id', id))

// ---------- Pallets ----------
export const pallets = (org: string, opts: { centro?: string; estado?: string; envio?: string | null } = {}) => {
  let q = supabase.from('ac_pallets').select('*').eq('org_id', org).order('created_at', { ascending: false }).limit(300)
  if (opts.centro) q = q.eq('centro_id', opts.centro)
  if (opts.estado) q = q.eq('estado', opts.estado)
  if (opts.envio === null) q = q.is('envio_id', null)
  else if (opts.envio) q = q.eq('envio_id', opts.envio)
  return ok<Pallet[]>(q)
}
export const pallet = (id: string) => ok<Pallet>(supabase.from('ac_pallets').select('*').eq('id', id).single())
export const crearPallet = (centro: string, operador: string) => ok<{ id: string; codigo: string }[]>(supabase.rpc('ac_crear_pallet', { p_centro: centro, p_operador: operador })).then(r => r[0])
export const actualizarPallet = (id: string, p: Partial<Pallet>) => ok(supabase.from('ac_pallets').update(p).eq('id', id))
export const cajasDePallet = (palletId: string) => ok<Caja[]>(supabase.from('ac_cajas').select('*').eq('pallet_id', palletId).order('codigo'))
export const paletizar = async (palletId: string, codigo: string) => {
  const r = await ok<{ ok: boolean; error?: string; repetida?: boolean; caja: string; peso?: number; items?: number }>(supabase.rpc('ac_paletizar', { p_pallet: palletId, p_caja_codigo: codigo }))
  if (!r.ok) throw new Error(r.error ?? 'No se pudo agregar la caja')
  return r
}
export const despaletizar = (cajaId: string) => ok(supabase.rpc('ac_despaletizar', { p_caja: cajaId }))

// ---------- Envíos ----------
export const envios = (org: string) => ok<Envio[]>(supabase.from('ac_envios').select('*').eq('org_id', org).order('fecha', { ascending: false }))
export const envio = (id: string) => ok<Envio>(supabase.from('ac_envios').select('*').eq('id', id).single())
export const crearEnvio = (e: { org_id: string; codigo: string; nombre: string; destino: string; fecha: string }) => ok<Envio>(supabase.from('ac_envios').insert(e).select().single())
export const actualizarEnvio = (id: string, p: Partial<Envio>) => ok(supabase.from('ac_envios').update(p).eq('id', id))
export const envioResumen = (id: string) => ok<{ pallets: number; cajas: number; items: number; lineas: number; peso: number }>(supabase.rpc('ac_envio_resumen', { p_envio: id }))
export const packingEnvio = (id: string) => ok<{ pallet: string; caja: string; peso_caja: number | null; cantidad: number; descripcion: string; canonica: string | null; marca: string | null; unidad: string | null; categoria: string | null; hs_code: string | null; valor_unitario: number | null }[]>(supabase.rpc('ac_packing_envio', { p_envio: id }))

// ---------- Incidencias ----------
export const incidencias = (org: string) => ok<Incidencia[]>(supabase.from('ac_incidencias').select('*').eq('org_id', org).order('created_at', { ascending: false }).limit(300))
export const resolverIncidencia = (id: number, resuelta: boolean) => ok(supabase.from('ac_incidencias').update({ resuelta }).eq('id', id))
