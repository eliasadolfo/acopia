import { useEffect, useState } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import type { Panel as P } from '../lib/supabase'
import { planVigente, PLANES } from '../lib/supabase'
import { fmt, fechaHora } from '../components/Layout'
import { ir } from '../lib/router'

export function Panel() {
  const { org, centroActual, miNombre, oferta } = useStore()
  const [p, setP] = useState<P | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (org) db.panel(org.id).then(setP).catch(e => setErr(e.message)) }, [org])
  if (!org) return null
  const plan = planVigente(org)
  const lim = plan === 'gratis' ? oferta.gratis_max_cajas : PLANES[plan].limiteCajas
  const maxCat = Math.max(1, ...(p?.por_categoria.map(c => Number(c.items)) ?? [1]))
  return (
    <div className="stack">
      <div className="row between">
        <div><h1>{org.nombre}</h1><div className="muted small">Panel de control · {p ? 'actualizado ' + fechaHora(p.actualizado) : 'cargando…'}</div></div>
      </div>
      <div className="row">
        <button className="xl grow" onClick={() => ir('/cajas?nueva=1')} disabled={!centroActual}>+ Registrar caja</button>
        <button className="xl sec grow" onClick={() => ir('/pallets?nuevo=1')} disabled={!centroActual}>+ Armar pallet</button>
      </div>
      {err && <div className="error">{err}</div>}
      {p && (
        <>
          <div className="kpis">
            <div className="kpi brand"><div className="v">{fmt(p.cajas)}</div><div className="l">Cajas registradas{lim ? ` · plan gratis: ${lim}` : ''}</div></div>
            <div className="kpi"><div className="v">{fmt(p.cajas_sin_paletizar)}</div><div className="l">Sin paletizar</div></div>
            <div className="kpi"><div className="v">{fmt(p.pallets_cerrados)}<span className="muted" style={{ fontSize: '.9rem', fontWeight: 600 }}> +{fmt(p.pallets_abiertos)} abiertos</span></div><div className="l">Pallets cerrados</div></div>
            <div className="kpi"><div className="v">{fmt(p.peso_paletizado / 1000, 2)} t</div><div className="l">Peso paletizado</div></div>
            <div className="kpi"><div className="v">{fmt(p.items)}</div><div className="l">Ítems (suma de cantidades)</div></div>
            <div className="kpi"><div className="v">{fmt(p.lineas)}</div><div className="l">Líneas de inventario</div></div>
            <div className="kpi"><div className="v">{fmt(p.envios)}</div><div className="l">Despachos</div></div>
            <div className={`kpi ${p.incidencias ? 'warn' : ''}`}><div className="v">{fmt(p.incidencias)}</div><div className="l">Incidencias abiertas</div></div>
          </div>
          {lim && p.cajas >= lim * 0.8 && (
            <div className="aviso">Vas en {p.cajas} de {lim} cajas del plan gratis. <a href="#/plan">Activa Campaña</a> para seguir sin tope.</div>
          )}
          {p.por_centro.length > 0 && (
            <div className="card">
              <h2>Por bodega</h2>
              <div className="tabla-wrap"><table><thead><tr><th>Bodega</th><th className="num">Cajas</th><th className="num">Pallets</th><th className="num">Peso (kg)</th></tr></thead>
                <tbody>{p.por_centro.map(c => <tr key={c.prefijo}><td>{c.centro} <span className="chip">{c.prefijo}</span></td><td className="num">{fmt(c.cajas)}</td><td className="num">{fmt(c.pallets_cerrados)}{c.pallets_abiertos ? <span className="muted"> +{c.pallets_abiertos}</span> : null}</td><td className="num">{fmt(c.peso, 1)}</td></tr>)}</tbody></table></div>
            </div>
          )}
          <div className="card">
            <div className="row between"><h2>Por categoría</h2><a href="#/stock" className="small">Ver stock por producto →</a></div>
            {p.por_categoria.length === 0 ? <p className="muted">Aún no hay ítems registrados. {miNombre ? `${miNombre.split(' ')[0]}, ` : ''}registra tu primera caja.</p> :
              <div className="stack">{p.por_categoria.map(c => (
                <div key={c.categoria}><div className="row between small"><span>{c.categoria}</span><span className="muted">{fmt(c.items)} ítems · {fmt(c.lineas)} líneas</span></div><div className="barra"><div style={{ width: `${(100 * Number(c.items)) / maxCat}%` }} /></div></div>
              ))}</div>}
          </div>
          {p.por_envio.length > 0 && (
            <div className="card">
              <h2>Despachos</h2>
              <div className="tabla-wrap"><table><thead><tr><th>Despacho</th><th>Estado</th><th className="num">Pallets</th><th className="num">Cajas</th><th className="num">Ítems</th><th className="num">Peso (kg)</th></tr></thead>
                <tbody>{p.por_envio.map(e => <tr key={e.codigo}><td><b>{e.codigo}</b>{e.nombre ? <div className="small muted">{e.nombre}</div> : null}</td><td><span className={`chip ${e.estado === 'cerrado' ? 'ok' : 'warn'}`}>{e.estado}</span></td><td className="num">{fmt(e.pallets)}</td><td className="num">{fmt(e.cajas)}</td><td className="num">{fmt(e.items)}</td><td className="num">{fmt(e.peso, 1)}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
