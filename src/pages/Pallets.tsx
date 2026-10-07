import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import type { Caja, Item, Pallet } from '../lib/supabase'
import { mensajeError } from '../lib/supabase'
import { Toast, Vacio, fmt, fechaHora } from '../components/Layout'
import { ir, useRuta } from '../lib/router'
import { Scanner, soportaCamara } from '../components/Scanner'
import { imprimirPallet, imprimirEtiquetas } from '../lib/print'

function useToast() {
  const [t, setT] = useState<{ msg: string; tipo?: 'ok' | 'err' } | null>(null)
  const mostrar = useCallback((msg: string, tipo?: 'ok' | 'err') => { setT({ msg, tipo }); setTimeout(() => setT(null), 3000) }, [])
  return { toast: t, mostrar }
}

export function Pallets() {
  const { org, centroActual, miNombre } = useStore()
  const ruta = useRuta()
  const [lista, setLista] = useState<Pallet[]>([])
  const [estado, setEstado] = useState('')
  const { toast, mostrar } = useToast()
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => { if (org) setLista(await db.pallets(org.id, { estado, centro: centroActual?.id })) }, [org, estado, centroActual])
  useEffect(() => { void cargar() }, [cargar])

  const nuevo = useCallback(async () => {
    if (!centroActual || creando) return
    setCreando(true)
    try { const r = await db.crearPallet(centroActual.id, miNombre); ir(`/pallets/${r.id}`) } catch (e) { mostrar(mensajeError(e), 'err') } finally { setCreando(false) }
  }, [centroActual, miNombre, creando, mostrar])
  useEffect(() => { if (ruta.query.get('nuevo') === '1') { window.history.replaceState(null, '', '#/pallets'); void nuevo() } }, [ruta.query, nuevo])

  return (
    <div className="stack">
      <div className="row between"><h1>Pallets</h1><button onClick={nuevo} disabled={!centroActual || creando}>+ Nuevo pallet</button></div>
      <div className="row"><select value={estado} onChange={e => setEstado(e.target.value)} style={{ width: 'auto' }}><option value="">Todos</option><option value="abierto">Abiertos</option><option value="cerrado">Cerrados</option></select></div>
      {lista.length === 0 ? <Vacio ico="🧱" titulo="Sin pallets" texto="Arma el primero y escanea las cajas que subes."><button onClick={nuevo} disabled={!centroActual}>Armar primer pallet</button></Vacio> : (
        <div className="lista">{lista.map(p => (
          <a key={p.id} href={`#/pallets/${p.id}`} className="item">
            <div className="grow"><div className="cod">{p.codigo}</div><div className="sub">{p.operador_nombre ?? '—'} · {fechaHora(p.created_at)}{p.envio_id ? ' · en envío' : ''}</div></div>
            <span className={`chip ${p.estado === 'cerrado' ? 'ok' : 'warn'}`}>{p.estado}</span>
          </a>
        ))}</div>
      )}
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}

export function PalletDetalle({ id }: { id: string }) {
  const { org, centros } = useStore()
  const [p, setP] = useState<Pallet | null>(null)
  const [cajas, setCajas] = useState<Caja[]>([])
  const [codigo, setCodigo] = useState('')
  const [camara, setCamara] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { toast, mostrar } = useToast()
  const [dims, setDims] = useState({ largo: '120', ancho: '100', alto: '160', tara: '25' })
  const inputRef = useRef<HTMLInputElement>(null)
  const centro = centros.find(c => c.id === p?.centro_id)

  const cargar = useCallback(async () => {
    try {
      const x = await db.pallet(id); setP(x)
      setDims({ largo: x.largo_cm?.toString() ?? '120', ancho: x.ancho_cm?.toString() ?? '100', alto: x.alto_cm?.toString() ?? '160', tara: x.tara_kg?.toString() ?? '25' })
      setCajas(await db.cajasDePallet(id))
    } catch (e) { setErr(mensajeError(e)) }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])

  const agregar = useCallback(async (cod: string) => {
    if (!p) return
    const c = cod.trim().toUpperCase()
    if (!c) return
    try {
      const r = await db.paletizar(p.id, c)
      if (r.repetida) mostrar(`${r.caja} ya estaba en este pallet`)
      else { mostrar(`✓ ${r.caja} agregada${r.peso ? ` · ${fmt(r.peso, 2)} kg` : ''}`, 'ok'); setCajas(await db.cajasDePallet(p.id)) }
      setCodigo('')
    } catch (e) { mostrar(mensajeError(e), 'err'); if (navigator.vibrate) navigator.vibrate([80, 60, 80]) }
    inputRef.current?.focus()
  }, [p, mostrar])

  function enviar(e: FormEvent) { e.preventDefault(); void agregar(codigo) }

  async function quitar(c: Caja) {
    try { await db.despaletizar(c.id); setCajas(x => x.filter(y => y.id !== c.id)); mostrar(`${c.codigo} fuera del pallet`) } catch (e) { mostrar(mensajeError(e), 'err') }
  }
  async function cerrar() {
    if (!p) return
    const n = (s: string) => (s ? Number(s.replace(',', '.')) : null)
    try {
      await db.actualizarPallet(p.id, { estado: 'cerrado', largo_cm: n(dims.largo), ancho_cm: n(dims.ancho), alto_cm: n(dims.alto), tara_kg: n(dims.tara) ?? 0, cerrado_at: new Date().toISOString() })
      await cargar(); setCamara(false); mostrar('Pallet cerrado', 'ok')
    } catch (e) { mostrar(mensajeError(e), 'err') }
  }
  async function reabrir() { if (!p) return; try { await db.actualizarPallet(p.id, { estado: 'abierto' }); await cargar() } catch (e) { mostrar(mensajeError(e), 'err') } }
  async function imprimir() {
    if (!p) return
    const its: Item[] = cajas.length ? await db.itemsDeCajas(cajas.map(c => c.id)) : []
    await imprimirPallet({ pallet: p, cajas, items: its, centro: centro?.nombre ?? '', org: org?.nombre ?? '' })
  }

  if (err) return <div className="error">{err}</div>
  if (!p) return <div className="muted">Cargando…</div>
  const peso = cajas.reduce((a, c) => a + Number(c.peso_kg ?? 0), 0)
  const sinPeso = cajas.filter(c => c.peso_kg == null).length
  const abierto = p.estado === 'abierto'

  return (
    <div className="stack">
      <div className="row between">
        <div><a href="#/pallets" className="small">← Pallets</a><h1 className="mono">{p.codigo}</h1><div className="muted small">{centro?.nombre} · {p.operador_nombre} · {fechaHora(p.created_at)}</div></div>
        <span className={`chip ${abierto ? 'warn' : 'ok'}`}>{p.estado}</span>
      </div>
      <div className="kpis">
        <div className="kpi brand"><div className="v">{cajas.length}</div><div className="l">Cajas</div></div>
        <div className="kpi"><div className="v">{fmt(peso, 1)}</div><div className="l">kg mercadería{sinPeso ? ` · ${sinPeso} sin peso` : ''}</div></div>
      </div>
      <div className="row">
        <button className="sec sm" onClick={imprimir}>🖨 Contenido del pallet</button>
        <button className="sec sm" onClick={() => imprimirEtiquetas([{ codigo: p.codigo, centro: centro?.nombre ?? '' }])}>🏷 Etiqueta</button>
        {p.envio_id && <a className="btn sec sm" href={`#/envios/${p.envio_id}`}>Ver envío</a>}
      </div>

      {abierto && (
        <div className="card">
          <h2>Subir cajas al pallet</h2>
          <p className="muted small">Escanea el QR de la etiqueta o escribe el código. Se valida que la caja exista y no esté en otro pallet.</p>
          <form onSubmit={enviar} className="row">
            <input ref={inputRef} className="grow mono" autoFocus autoCapitalize="characters" placeholder={`${centro?.prefijo ?? 'QN'}-0012`} value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} />
            <button>Agregar</button>
            {soportaCamara() && <button type="button" className={camara ? 'accent' : 'sec'} onClick={() => setCamara(x => !x)}>{camara ? 'Cerrar cámara' : '📷 Escanear'}</button>}
          </form>
          <div style={{ marginTop: '.75rem' }}><Scanner activo={camara} onCodigo={agregar} /></div>
        </div>
      )}

      <div className="card">
        <h2>Cajas en el pallet</h2>
        {cajas.length === 0 ? <p className="muted">Aún no hay cajas.</p> : (
          <div className="tabla-wrap"><table><thead><tr><th>Caja</th><th className="num">Peso (kg)</th><th>Operador</th><th></th></tr></thead>
            <tbody>{cajas.map(c => <tr key={c.id}><td><a href={`#/cajas/${c.id}`} className="mono"><b>{c.codigo}</b></a></td><td className="num">{fmt(c.peso_kg, 2)}</td><td className="small">{c.operador_nombre}</td><td>{abierto && <button className="ghost sm" onClick={() => quitar(c)} aria-label="Quitar">✕</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>

      <div className="card">
        <h2>{abierto ? 'Cerrar pallet' : 'Medidas'}</h2>
        <div className="campos-3">
          <div className="campo"><label>Largo (cm)</label><input inputMode="decimal" value={dims.largo} onChange={e => setDims(d => ({ ...d, largo: e.target.value }))} disabled={!abierto} /></div>
          <div className="campo"><label>Ancho (cm)</label><input inputMode="decimal" value={dims.ancho} onChange={e => setDims(d => ({ ...d, ancho: e.target.value }))} disabled={!abierto} /></div>
          <div className="campo"><label>Alto (cm)</label><input inputMode="decimal" value={dims.alto} onChange={e => setDims(d => ({ ...d, alto: e.target.value }))} disabled={!abierto} /></div>
        </div>
        <div className="row">
          <div className="campo grow" style={{ marginBottom: 0 }}><label>Tara del pallet y film (kg)</label><input inputMode="decimal" value={dims.tara} onChange={e => setDims(d => ({ ...d, tara: e.target.value }))} disabled={!abierto} /></div>
          {abierto ? <button onClick={cerrar} disabled={cajas.length === 0}>Cerrar pallet</button> : <button className="ghost" onClick={reabrir} disabled={!!p.envio_id}>Reabrir</button>}
        </div>
        {!abierto && <p className="small muted" style={{ marginTop: '.5rem' }}>Peso total estimado: <b>{fmt(peso + Number(p.tara_kg ?? 0), 1)} kg</b> (mercadería + tara){p.envio_id ? ' · asignado a un envío, no se puede reabrir' : ''}</p>}
      </div>
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}
