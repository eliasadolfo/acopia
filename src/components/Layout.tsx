import type { ReactNode } from 'react'
import { useStore } from '../store'
import { useRuta, ir } from '../lib/router'
import { planVigente, PLANES } from '../lib/supabase'

const Ico = {
  panel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  cajas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>,
  pallets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="8" y="12" width="8" height="5" rx="1"/><path d="M2 20h20"/></svg>,
  envios: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h13v10H1zM14 10h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
  mas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>,
}

export function Layout({ children }: { children: ReactNode }) {
  const { org, orgs, centros, centroActual, elegirOrg, elegirCentro } = useStore()
  const ruta = useRuta()
  const seccion = ruta.partes[0] ?? 'panel'
  const plan = org ? planVigente(org) : 'gratis'
  const tabs = [
    ['panel', 'Panel', Ico.panel], ['cajas', 'Cajas', Ico.cajas], ['pallets', 'Pallets', Ico.pallets], ['envios', 'Despachos', Ico.envios], ['mas', 'Más', Ico.mas],
  ] as const
  const activosCentros = centros.filter(c => c.activo)
  return (
    <div className="app">
      <header className="topbar">
        <a className="logo" href="#/panel">Encajados</a>
        <div className="grow" />
        {orgs.length > 1 && (
          <select aria-label="Organización" value={org?.id ?? ''} onChange={e => elegirOrg(e.target.value)}>
            {orgs.map(m => <option key={m.org_id} value={m.org_id}>{m.ac_orgs.nombre}</option>)}
          </select>
        )}
        {activosCentros.length > 1 ? (
          <select aria-label="Bodega" value={centroActual?.id ?? ''} onChange={e => elegirCentro(e.target.value)}>
            {activosCentros.map(c => <option key={c.id} value={c.id}>{c.prefijo} · {c.nombre}</option>)}
          </select>
        ) : centroActual ? <span className="chip brand">{centroActual.prefijo} · {centroActual.nombre}</span> : null}
        {plan !== 'gratis' ? <span className="chip ok">{PLANES[plan].nombre}</span> : <button className="sm accent" onClick={() => ir('/plan')}>Gratis</button>}
      </header>
      <nav className="nav" aria-label="Secciones">
        {tabs.map(([k, l, i]) => <a key={k} href={`#/${k}`} className={seccion === k || (k === 'mas' && ['incidencias', 'equipo', 'plan', 'bodegas', 'ajustes', 'admin', 'lia', 'stock'].includes(seccion)) ? 'activo' : ''}>{i}<span>{l}</span></a>)}
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}

export function Toast({ msg, tipo }: { msg: string | null; tipo?: 'ok' | 'err' }) {
  if (!msg) return null
  return <div className={`toast ${tipo ?? ''}`} role="status">{msg}</div>
}

export function Vacio({ ico, titulo, texto, children }: { ico: string; titulo: string; texto?: string; children?: ReactNode }) {
  return <div className="vacio"><div className="ico" aria-hidden>{ico}</div><h3>{titulo}</h3>{texto && <p>{texto}</p>}{children}</div>
}

export const fmt = (n: number | null | undefined, dec = 0) => (n == null ? '—' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: 0 }))
export const fecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
export const fechaHora = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
