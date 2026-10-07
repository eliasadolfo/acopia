import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Centro, Miembro, Org, Rol, Oferta } from './lib/supabase'
import { OFERTA_DEFECTO } from './lib/supabase'
import * as db from './lib/db'

interface Estado {
  cargando: boolean
  session: Session | null
  orgs: (Miembro & { ac_orgs: Org })[]
  org: Org | null
  rol: Rol | null
  miNombre: string
  centros: Centro[]
  centroActual: Centro | null
  oferta: Oferta
  elegirOrg: (id: string) => void
  elegirCentro: (id: string) => void
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Estado | null>(null)
const LS_ORG = 'acopia.org'
const LS_CENTRO = 'acopia.centro'

export function Store({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [orgs, setOrgs] = useState<(Miembro & { ac_orgs: Org })[]>([])
  const [orgId, setOrgId] = useState<string | null>(() => localStorage.getItem(LS_ORG))
  const [centros, setCentros] = useState<Centro[]>([])
  const [centroId, setCentroId] = useState<string | null>(() => localStorage.getItem(LS_CENTRO))
  const [oferta, setOferta] = useState<Oferta>(OFERTA_DEFECTO)
  useEffect(() => { supabase.rpc('ac_oferta').then(r => { if (r.data) setOferta(r.data as Oferta) }) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setCargando(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setOrgs([]); setCentros([]); setCargando(false) } })
    return () => sub.subscription.unsubscribe()
  }, [])

  const recargar = useCallback(async () => {
    if (!session) return
    try {
      const ms = await db.misMembresias()
      setOrgs(ms)
      const elegido = ms.find(m => m.org_id === orgId) ?? ms[0]
      const id = elegido?.org_id ?? null
      if (id !== orgId) setOrgId(id)
      if (id) {
        localStorage.setItem(LS_ORG, id)
        const cs = await db.centros(id)
        setCentros(cs)
        const c = cs.find(x => x.id === centroId && x.activo) ?? cs.find(x => x.activo) ?? null
        if (c?.id !== centroId) setCentroId(c?.id ?? null)
        if (c) localStorage.setItem(LS_CENTRO, c.id)
      } else setCentros([])
    } finally { setCargando(false) }
  }, [session, orgId, centroId])

  useEffect(() => { if (session) void recargar() }, [session, recargar])

  const valor = useMemo<Estado>(() => {
    const m = orgs.find(x => x.org_id === orgId) ?? null
    return {
      cargando, session, orgs,
      org: m?.ac_orgs ?? null, rol: m?.rol ?? null, miNombre: m?.nombre ?? session?.user.email ?? '',
      centros, centroActual: centros.find(c => c.id === centroId) ?? null, oferta,
      elegirOrg: (id) => { localStorage.setItem(LS_ORG, id); localStorage.removeItem(LS_CENTRO); setCentroId(null); setOrgId(id) },
      elegirCentro: (id) => { localStorage.setItem(LS_CENTRO, id); setCentroId(id) },
      recargar,
      salir: async () => { await supabase.auth.signOut(); localStorage.removeItem(LS_ORG); localStorage.removeItem(LS_CENTRO); setOrgId(null); setCentroId(null) },
    }
  }, [cargando, session, orgs, orgId, centros, centroId, recargar, oferta])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useStore(): Estado {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fuera de <Store>')
  return v
}
