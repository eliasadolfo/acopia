import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && key)

export const supabase = createClient(url ?? 'https://sin-configurar.supabase.co', key ?? 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const CHECKOUT = {
  campana: import.meta.env.VITE_CHECKOUT_CAMPANA as string | undefined,
  pro: import.meta.env.VITE_CHECKOUT_PRO as string | undefined,
}
export const WHATSAPP = (import.meta.env.VITE_WHATSAPP as string | undefined) ?? ''

// ---------- Tipos ----------
export type Plan = 'gratis' | 'campana' | 'pro'
export type Rol = 'admin' | 'operador'

export interface Org { id: string; nombre: string; pais: string | null; tipo: string | null; plan: Plan; plan_vence: string | null; created_at: string }
export interface Miembro { org_id: string; user_id: string; rol: Rol; nombre: string | null }
export interface Centro { id: string; org_id: string; nombre: string; prefijo: string; direccion: string | null; proxima_caja: number; proximo_pallet: number; activo: boolean }
export interface Caja { id: string; org_id: string; centro_id: string; codigo: string; estado: 'abierta' | 'cerrada' | 'paletizada'; peso_kg: number | null; operador_nombre: string | null; pallet_id: string | null; created_at: string; cerrada_at: string | null }
export interface Item { id: number; org_id: string; caja_id: string; cantidad: number; descripcion: string; canonica: string | null; marca: string | null; unidad: string | null; categoria: string | null; valor_unitario: number | null }
export interface Pallet { id: string; org_id: string; centro_id: string; codigo: string; estado: 'abierto' | 'cerrado'; largo_cm: number | null; ancho_cm: number | null; alto_cm: number | null; tara_kg: number; operador_nombre: string | null; envio_id: string | null; created_at: string; cerrado_at: string | null }
export interface Envio { id: string; org_id: string; codigo: string; nombre: string | null; destino: string | null; estado: 'abierto' | 'cerrado'; fecha: string; notas: string | null; created_at: string }
export interface Incidencia { id: number; org_id: string; tipo: string; pallet_codigo: string | null; caja_codigo: string | null; detalle: string | null; resuelta: boolean; created_at: string }
export interface Categoria { id: string; org_id: string | null; nombre: string; hs_code: string | null; orden: number }

export interface Panel {
  cajas: number; cajas_paletizadas: number; cajas_sin_paletizar: number
  pallets_cerrados: number; pallets_abiertos: number
  items: number; lineas: number; peso_paletizado: number; envios: number; incidencias: number
  por_centro: { centro: string; prefijo: string; cajas: number; pallets_cerrados: number; pallets_abiertos: number; peso: number }[]
  por_categoria: { categoria: string; items: number; lineas: number }[]
  por_envio: { codigo: string; nombre: string | null; estado: string; fecha: string; pallets: number; cajas: number; items: number; peso: number }[]
  actualizado: string
}

export const PLANES: Record<Plan, { nombre: string; limiteCajas: number | null; limiteCentros: number | null }> = {
  gratis: { nombre: 'Gratis', limiteCajas: 150, limiteCentros: 1 },
  campana: { nombre: 'Campaña', limiteCajas: null, limiteCentros: null },
  pro: { nombre: 'Pro', limiteCajas: null, limiteCentros: null },
}

export function planVigente(org: Org): Plan {
  if (org.plan !== 'gratis' && (!org.plan_vence || new Date(org.plan_vence) > new Date())) return org.plan
  return 'gratis'
}

export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (m.startsWith('PLAN_LIMITE:')) return m.replace('PLAN_LIMITE:', '').trim()
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos'
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión.'
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres'
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja)'
  if (/rate limit/i.test(m)) return 'Demasiados intentos; espera un minuto'
  return m
}
