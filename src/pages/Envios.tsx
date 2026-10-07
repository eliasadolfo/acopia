import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import type { Envio, Pallet } from '../lib/supabase'
import { mensajeError, planVigente } from '../lib/supabase'
import { ir } from '../lib/router'
import { Toast, Vacio, fmt, fecha } from '../components/Layout'
import { descargarCSV } from '../lib/print'

function useToast() {
  const [t, setT] = useState<{ msg: string; tipo?: 'ok' | 'err' } | null>(null)
  const mostrar = useCallback((msg: string, tipo?: 'ok' | 'err') => { setT({ msg, tipo }); setTimeout(() => setT(null), 3000) }, [])
  return { toast: t, mostrar }
}

export function Envios() {
  const { org, rol, oferta } = useStore()
  const [lista, setLista] = useState<Envio[]>([])
  const [nuevo, setNuevo] = useState(false)
  const [f, setF] = useState({ nombre: '', destino: '', fecha: new Date().toISOString().slice(0, 10) })
  const { toast, mostrar } = useToast()
  const cargar = useCallback(async () => { if (org) setLista(await db.envios(org.id)) }, [org])
  useEffect(() => { void cargar() }, [cargar])

  async function crear(e: FormEvent) {
    e.preventDefault(); if (!org) return
    if (planVigente(org) === 'gratis' && oferta.gratis_max_envios != null && lista.length >= oferta.gratis_max_envios) { mostrar(`El plan gratis incluye ${oferta.gratis_max_envios} envío. Activa Campaña para más.`, 'err'); return }
    const n = lista.length + 1
    try { await db.crearEnvio({ org_id: org.id, codigo: `DSP-${String(n).padStart(3, '0')}`, nombre: f.nombre, destino: f.destino, fecha: f.fecha }); setNuevo(false); setF({ nombre: '', destino: '', fecha: new Date().toISOString().slice(0, 10) }); await cargar() } catch (e) { mostrar(mensajeError(e), 'err') }
  }

  return (
    <div className="stack">
      <div className="row between"><h1>Despachos</h1>{rol === 'admin' && <button onClick={() => setNuevo(x => !x)}>+ Nuevo despacho</button>}</div>
      <p className="muted small">Un despacho agrupa pallets cerrados (camión, contenedor o courier). Desde aquí sacas el packing list y los documentos.</p>
      {nuevo && (
        <form className="card" onSubmit={crear}>
          <div className="campo"><label>Nombre</label><input required value={f.nombre} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))} placeholder="Contenedor 1 — Caracas" /></div>
          <div className="campos-2">
            <div className="campo"><label>Destino</label><input value={f.destino} onChange={e => setF(x => ({ ...x, destino: e.target.value }))} placeholder="La Guaira, Venezuela" /></div>
            <div className="campo"><label>Fecha</label><input type="date" value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} /></div>
          </div>
          <button>Crear despacho</button>
        </form>
      )}
      {lista.length === 0 ? <Vacio ico="🚚" titulo="Sin despachos" texto="Cuando tengas pallets cerrados, crea un despacho y asígnalos." /> : (
        <div className="lista">{lista.map(e => (
          <a key={e.id} href={`#/envios/${e.id}`} className="item">
            <div className="grow"><div className="cod">{e.codigo}</div><div className="sub">{e.nombre} · {e.destino || 'sin destino'} · {fecha(e.fecha)}</div></div>
            <span className={`chip ${e.estado === 'cerrado' ? 'ok' : 'warn'}`}>{e.estado}</span>
          </a>
        ))}</div>
      )}
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}

export function EnvioDetalle({ id }: { id: string }) {
  const { org, rol, oferta } = useStore()
  const [e, setE] = useState<Envio | null>(null)
  const [asignados, setAsignados] = useState<Pallet[]>([])
  const [libres, setLibres] = useState<Pallet[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { toast, mostrar } = useToast()
  const [resumen, setResumen] = useState<{ cajas: number; items: number; lineas: number; peso: number } | null>(null)

  const cargar = useCallback(async () => {
    if (!org) return
    try {
      const x = await db.envio(id); setE(x)
      const [a, l] = await Promise.all([db.pallets(org.id, { envio: id }), db.pallets(org.id, { estado: 'cerrado', envio: null })])
      setAsignados(a); setLibres(l)
      const r = await db.envioResumen(id)
      setResumen({ cajas: Number(r.cajas), items: Number(r.items), lineas: Number(r.lineas), peso: Number(r.peso) })
    } catch (er) { setErr(mensajeError(er)) }
  }, [id, org])
  useEffect(() => { void cargar() }, [cargar])

  async function asignar(p: Pallet) { try { await db.actualizarPallet(p.id, { envio_id: id }); await cargar() } catch (er) { mostrar(mensajeError(er), 'err') } }
  async function quitar(p: Pallet) { try { await db.actualizarPallet(p.id, { envio_id: null }); await cargar() } catch (er) { mostrar(mensajeError(er), 'err') } }
  const bloqueado = !!org && planVigente(org) === 'gratis' && !oferta.gratis_puede_despachar
  async function estado(nuevo: 'abierto' | 'cerrado') { if (nuevo === 'cerrado' && bloqueado) { ir('/plan'); return } try { await db.actualizarEnvio(id, { estado: nuevo }); await cargar() } catch (er) { mostrar(mensajeError(er), 'err') } }
  async function conPlan(f: () => Promise<void>) { if (bloqueado) { ir('/plan'); return } try { await f() } catch (er) { mostrar(mensajeError(er), 'err') } }

  async function exportarPacking() {
    const pk = await db.packingEnvio(id)
    descargarCSV(`${e?.codigo ?? 'envio'}_packing_list.csv`, [
      ['Pallet', 'Caja', 'Peso caja (kg)', 'Cantidad', 'Descripción', 'Descripción canónica', 'Marca', 'Unidad', 'Categoría', 'HS code', 'Valor unitario', 'Valor total'],
      ...pk.map(r => [r.pallet, r.caja, r.peso_caja, r.cantidad, r.descripcion, r.canonica, r.marca, r.unidad, r.categoria, r.hs_code, r.valor_unitario, r.valor_unitario != null ? Number(r.valor_unitario) * Number(r.cantidad) : null]),
    ])
  }
  async function exportarResumen() {
    const pk = await db.packingEnvio(id)
    const agg = new Map<string, { cant: number; cat: string | null; hs: string | null; lineas: number }>()
    pk.forEach(r => { const k = r.canonica || r.descripcion; const a = agg.get(k) ?? { cant: 0, cat: r.categoria, hs: r.hs_code, lineas: 0 }; a.cant += Number(r.cantidad); a.lineas++; agg.set(k, a) })
    descargarCSV(`${e?.codigo ?? 'envio'}_resumen_por_producto.csv`, [['Producto', 'Categoría', 'HS code', 'Cantidad total', 'Líneas'], ...Array.from(agg.entries()).sort((a, b) => b[1].cant - a[1].cant).map(([k, v]) => [k, v.cat, v.hs, v.cant, v.lineas])])
  }
  async function exportarPallets() {
    descargarCSV(`${e?.codigo ?? 'envio'}_pallets.csv`, [['Pallet', 'Estado', 'Largo', 'Ancho', 'Alto', 'Tara (kg)', 'Operador'], ...asignados.map(p => [p.codigo, p.estado, p.largo_cm, p.ancho_cm, p.alto_cm, p.tara_kg, p.operador_nombre])])
  }

  if (err) return <div className="error">{err}</div>
  if (!e) return <div className="muted">Cargando…</div>
  const abierto = e.estado === 'abierto'
  return (
    <div className="stack">
      <div className="row between">
        <div><a href="#/envios" className="small">← Despachos</a><h1>{e.codigo} · {e.nombre}</h1><div className="muted small">{e.destino || 'sin destino'} · {fecha(e.fecha)}</div></div>
        <span className={`chip ${abierto ? 'warn' : 'ok'}`}>{e.estado}</span>
      </div>
      {resumen && (
        <div className="kpis">
          <div className="kpi brand"><div className="v">{asignados.length}</div><div className="l">Pallets</div></div>
          <div className="kpi"><div className="v">{fmt(resumen.cajas)}</div><div className="l">Cajas</div></div>
          <div className="kpi"><div className="v">{fmt(resumen.items)}</div><div className="l">Ítems</div></div>
          <div className="kpi"><div className="v">{fmt(resumen.peso / 1000, 2)} t</div><div className="l">Peso con tara</div></div>
        </div>
      )}
      <div className="card">
        <h2>Documentos</h2>
        <div className="row">
          <button className="sec sm" onClick={() => conPlan(exportarPacking)}>⬇ Packing list detallado (CSV)</button>
          <button className="sec sm" onClick={() => conPlan(exportarResumen)}>⬇ Resumen por producto + HS</button>
          <button className="sec sm" onClick={() => conPlan(exportarPallets)}>⬇ Lista de pallets</button>
        </div>
        {bloqueado && <div className="aviso">Registrar y paletizar es gratis sin límite. Para <b>cerrar el despacho y descargar los documentos</b> activa un plan desde US$19 al mes. <a href="#/plan">Ver planes</a></div>}
        <p className="small muted" style={{ marginTop: '.5rem' }}>Los CSV abren en Excel o Google Sheets. El HS code sale del catálogo (por palabra clave o categoría); revísalo con tu agente de aduana.</p>
      </div>
      <div className="card">
        <div className="row between"><h2>Pallets del despacho</h2>{rol === 'admin' && (abierto ? <button className="sm" onClick={() => estado('cerrado')} disabled={asignados.length === 0}>Cerrar despacho</button> : <button className="sm ghost" onClick={() => estado('abierto')}>Reabrir</button>)}</div>
        {asignados.length === 0 ? <p className="muted">Sin pallets asignados.</p> : (
          <div className="lista">{asignados.map(p => <div key={p.id} className="item"><a href={`#/pallets/${p.id}`} className="grow"><span className="cod">{p.codigo}</span></a>{abierto && <button className="ghost sm" onClick={() => quitar(p)}>Quitar</button>}</div>)}</div>
        )}
      </div>
      {abierto && (
        <div className="card">
          <h2>Pallets cerrados disponibles</h2>
          {libres.length === 0 ? <p className="muted">No hay pallets cerrados sin despacho.</p> : (
            <div className="lista">{libres.map(p => <div key={p.id} className="item"><div className="grow"><span className="cod">{p.codigo}</span><div className="sub">{p.operador_nombre}</div></div><button className="sm" onClick={() => asignar(p)}>Asignar</button></div>)}</div>
          )}
        </div>
      )}
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}
