import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import type { Caja, Categoria, Item } from '../lib/supabase'
import { mensajeError } from '../lib/supabase'
import { Toast, Vacio, fmt, fechaHora } from '../components/Layout'
import { ir, useRuta } from '../lib/router'
import { imprimirCajas, imprimirEtiquetas } from '../lib/print'

function useToast() {
  const [t, setT] = useState<{ msg: string; tipo?: 'ok' | 'err' } | null>(null)
  const mostrar = useCallback((msg: string, tipo?: 'ok' | 'err') => { setT({ msg, tipo }); setTimeout(() => setT(null), 2600) }, [])
  return { toast: t, mostrar }
}

// ---------------- Lista de cajas ----------------
export function Cajas() {
  const { org, centroActual, miNombre } = useStore()
  const ruta = useRuta()
  const [lista, setLista] = useState<Caja[]>([])
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('')
  const [cargando, setCargando] = useState(true)
  const { toast, mostrar } = useToast()
  const [creando, setCreando] = useState(false)
  const nuevaPedida = useRef(false)

  const cargar = useCallback(async () => {
    if (!org) return
    setCargando(true)
    try { setLista(await db.cajas(org.id, { buscar, estado, centro: centroActual?.id })) } finally { setCargando(false) }
  }, [org, buscar, estado, centroActual])
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [cargar])

  const nueva = useCallback(async () => {
    if (!centroActual || creando) return
    setCreando(true)
    try {
      const r = await db.crearCaja(centroActual.id, miNombre)
      ir(`/cajas/${r.id}`)
    } catch (e) { mostrar(mensajeError(e), 'err') } finally { setCreando(false) }
  }, [centroActual, miNombre, creando, mostrar])

  useEffect(() => { if (ruta.query.get('nueva') === '1' && !nuevaPedida.current) { nuevaPedida.current = true; window.history.replaceState(null, '', '#/cajas'); void nueva() } }, [ruta.query, nueva])

  return (
    <div className="stack">
      <div className="row between"><h1>Cajas</h1><button onClick={nueva} disabled={!centroActual || creando}>+ Nueva caja</button></div>
      {!centroActual && <div className="aviso">Crea una bodega en <a href="#/bodegas">Más → Bodegas</a> para registrar cajas.</div>}
      <div className="row">
        <input className="grow" placeholder="Buscar por código (QN-0012)" value={buscar} onChange={e => setBuscar(e.target.value)} />
        <select value={estado} onChange={e => setEstado(e.target.value)} style={{ width: 'auto' }}><option value="">Todas</option><option value="abierta">Abiertas</option><option value="cerrada">Cerradas</option><option value="paletizada">Paletizadas</option></select>
      </div>
      {cargando && lista.length === 0 ? <div className="muted">Cargando…</div> : lista.length === 0 ? (
        <Vacio ico="📦" titulo="Todavía no hay cajas" texto="Registra la primera: el código se asigna solo y la lista de empaque se imprime con un toque."><button onClick={nueva} disabled={!centroActual}>Registrar primera caja</button></Vacio>
      ) : (
        <div className="lista">{lista.map(c => (
          <a key={c.id} href={`#/cajas/${c.id}`} className="item">
            <div className="grow"><div className="cod">{c.codigo}</div><div className="sub">{c.operador_nombre ?? '—'} · {fechaHora(c.created_at)}{c.peso_kg ? ` · ${fmt(c.peso_kg, 2)} kg` : ''}</div></div>
            <span className={`chip ${c.estado === 'paletizada' ? 'ok' : c.estado === 'cerrada' ? 'brand' : 'warn'}`}>{c.estado}</span>
          </a>
        ))}</div>
      )}
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}

// ---------------- Detalle de caja (captura de ítems) ----------------
const UNIDADES = ['unidad', 'kg', 'g', 'L', 'ml', 'paquete', 'caja', 'par', 'kit', 'comprimidos', 'cápsulas', 'ampollas', 'sobres', 'frasco', 'tubo', 'rollo']

export function CajaDetalle({ id }: { id: string }) {
  const { org, centros, rol } = useStore()
  const [caja, setCaja] = useState<Caja | null>(null)
  const [its, setIts] = useState<Item[]>([])
  const [cats, setCats] = useState<Categoria[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { toast, mostrar } = useToast()
  const [f, setF] = useState({ cantidad: '', descripcion: '', canonica: '', marca: '', unidad: '', categoria: '' })
  const [sug, setSug] = useState<{ canonica: string; categoria: string | null; fuente: string }[]>([])
  const [mostrarSug, setMostrarSug] = useState(false)
  const [peso, setPeso] = useState('')
  const descRef = useRef<HTMLInputElement>(null)
  const cantRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))

  const cargar = useCallback(async () => {
    try {
      const c = await db.caja(id); setCaja(c); setPeso(c.peso_kg?.toString() ?? '')
      setIts(await db.items(id))
    } catch (e) { setErr(mensajeError(e)) }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { if (org) db.categorias(org.id).then(setCats).catch(() => {}) }, [org])

  // Autocompletar con el diccionario (org + global)
  useEffect(() => {
    if (!org || f.descripcion.trim().length < 2) { setSug([]); return }
    const t = setTimeout(() => db.sugerir(org.id, f.descripcion).then(s => { setSug(s); setMostrarSug(true) }).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [org, f.descripcion])

  const centro = centros.find(c => c.id === caja?.centro_id)
  const bloqueada = caja?.estado === 'paletizada'

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!org || !caja || bloqueada) return
    const cantidad = Number(f.cantidad.replace(',', '.'))
    if (!(cantidad > 0)) { mostrar('Indica la cantidad', 'err'); cantRef.current?.focus(); return }
    if (!f.descripcion.trim()) { mostrar('Indica la descripción', 'err'); descRef.current?.focus(); return }
    try {
      const nuevo = await db.agregarItem({ org_id: org.id, caja_id: caja.id, cantidad, descripcion: f.descripcion.trim(), canonica: f.canonica.trim() || f.descripcion.trim(), marca: f.marca.trim() || null, unidad: f.unidad.trim() || null, categoria: f.categoria || null, valor_unitario: null })
      setIts(x => [...x, nuevo])
      // Aprende para la próxima vez (solo si cambió la canónica o la categoría)
      if (f.canonica.trim() || f.categoria) void db.aprenderCanonica(org.id, f.descripcion.trim(), f.canonica.trim() || f.descripcion.trim(), f.categoria || null)
      setF(x => ({ cantidad: '', descripcion: '', canonica: '', marca: '', unidad: x.unidad, categoria: x.categoria }))
      setSug([]); cantRef.current?.focus()
      if (caja.estado === 'abierta') { /* sigue abierta */ }
    } catch (e) { mostrar(mensajeError(e), 'err') }
  }

  async function borrar(it: Item) {
    if (bloqueada) return
    try { await db.borrarItem(it.id); setIts(x => x.filter(y => y.id !== it.id)) } catch (e) { mostrar(mensajeError(e), 'err') }
  }

  async function cerrar() {
    if (!caja) return
    const p = peso ? Number(peso.replace(',', '.')) : null
    try { await db.actualizarCaja(caja.id, { estado: 'cerrada', peso_kg: p, cerrada_at: new Date().toISOString() }); await cargar(); mostrar('Caja cerrada', 'ok') } catch (e) { mostrar(mensajeError(e), 'err') }
  }
  async function reabrir() {
    if (!caja) return
    try { await db.actualizarCaja(caja.id, { estado: 'abierta' }); await cargar() } catch (e) { mostrar(mensajeError(e), 'err') }
  }
  async function guardarPeso() {
    if (!caja) return
    const p = peso ? Number(peso.replace(',', '.')) : null
    try { await db.actualizarCaja(caja.id, { peso_kg: p }); mostrar('Peso guardado', 'ok') } catch (e) { mostrar(mensajeError(e), 'err') }
  }
  async function eliminarCaja() {
    if (!caja || its.length > 0 || !confirm(`¿Eliminar la caja ${caja.codigo}? El número no se reutiliza.`)) return
    try { await db.borrarCaja(caja.id); ir('/cajas') } catch (e) { mostrar(mensajeError(e), 'err') }
  }

  if (err) return <div className="error">{err}</div>
  if (!caja) return <div className="muted">Cargando…</div>
  const total = its.reduce((a, b) => a + Number(b.cantidad), 0)

  return (
    <div className="stack">
      <div className="row between">
        <div><a href="#/cajas" className="small">← Cajas</a><h1 className="mono">{caja.codigo}</h1><div className="muted small">{centro?.nombre} · {caja.operador_nombre} · {fechaHora(caja.created_at)}</div></div>
        <span className={`chip ${caja.estado === 'paletizada' ? 'ok' : caja.estado === 'cerrada' ? 'brand' : 'warn'}`}>{caja.estado}</span>
      </div>
      <div className="row">
        <button className="sec sm" onClick={() => imprimirCajas([{ caja, items: its, centro: centro?.nombre ?? '', org: org?.nombre ?? '' }])}>🖨 Lista de empaque</button>
        <button className="sec sm" onClick={() => imprimirEtiquetas([{ codigo: caja.codigo, centro: centro?.nombre ?? '' }])}>🏷 Etiqueta QR</button>
        {caja.pallet_id && <a className="btn sec sm" href={`#/pallets/${caja.pallet_id}`}>Ver pallet</a>}
      </div>

      {!bloqueada && (
        <form className="card" onSubmit={agregar} autoComplete="off">
          <h2>Agregar ítem</h2>
          <div className="campos-3">
            <div className="campo"><label htmlFor="cant">Cantidad</label><input id="cant" ref={cantRef} inputMode="decimal" value={f.cantidad} onChange={e => set('cantidad', e.target.value)} placeholder="24" /></div>
            <div className="campo" style={{ gridColumn: 'span 2' }}><label htmlFor="unid">Unidad / presentación</label><input id="unid" list="unidades" value={f.unidad} onChange={e => set('unidad', e.target.value)} placeholder="16 comprimidos, 1 kg, 100 unidades" /><datalist id="unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist></div>
          </div>
          <div className="campo rel">
            <label htmlFor="desc">Descripción (lo que dice el envase)</label>
            <input id="desc" ref={descRef} value={f.descripcion} onChange={e => { set('descripcion', e.target.value); set('canonica', '') }} onFocus={() => setMostrarSug(true)} onBlur={() => setTimeout(() => setMostrarSug(false), 150)} placeholder="Paracetamol 500mg" />
            {mostrarSug && sug.length > 0 && (
              <div className="sugerencias">{sug.map((s, i) => (
                <button type="button" key={i} onMouseDown={e => e.preventDefault()} onClick={() => { setF(x => ({ ...x, canonica: s.canonica, categoria: s.categoria ?? x.categoria })); setMostrarSug(false) }}>
                  <span>{s.canonica}</span><span className="small muted">{s.categoria ?? ''}{s.fuente === 'org' ? ' · tuyo' : ''}</span>
                </button>
              ))}</div>
            )}
            {f.canonica && f.canonica !== f.descripcion && <div className="small muted">Se guardará como: <b>{f.canonica}</b></div>}
          </div>
          <div className="campos-2">
            <div className="campo"><label htmlFor="marca">Marca / fabricante</label><input id="marca" value={f.marca} onChange={e => set('marca', e.target.value)} placeholder="Laboratorio Chile" /></div>
            <div className="campo"><label htmlFor="cat">Categoría</label><select id="cat" value={f.categoria} onChange={e => set('categoria', e.target.value)}><option value="">— elegir —</option>{cats.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></div>
          </div>
          <button className="block">Agregar a la caja</button>
        </form>
      )}

      <div className="card">
        <div className="row between"><h2>Contenido</h2><span className="muted small">{its.length} líneas · {fmt(total)} unidades</span></div>
        {its.length === 0 ? <p className="muted">Sin ítems todavía.</p> : (
          <div className="tabla-wrap"><table><thead><tr><th className="num">Cant.</th><th>Descripción</th><th>Marca</th><th>Unidad</th><th>Categoría</th><th></th></tr></thead>
            <tbody>{its.map(i => <tr key={i.id}><td className="num">{fmt(i.cantidad)}</td><td>{i.canonica || i.descripcion}{i.canonica && i.canonica !== i.descripcion ? <div className="small muted">{i.descripcion}</div> : null}</td><td>{i.marca}</td><td>{i.unidad}</td><td><span className="chip">{i.categoria ?? '—'}</span></td><td>{!bloqueada && <button className="ghost sm" onClick={() => borrar(i)} aria-label="Quitar">✕</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>

      <div className="card">
        <h2>Cerrar caja</h2>
        <div className="row">
          <div className="campo grow" style={{ marginBottom: 0 }}><label htmlFor="peso">Peso (kg, con la caja)</label><input id="peso" inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} placeholder="18,5" disabled={bloqueada} /></div>
          {caja.estado === 'abierta' ? <button onClick={cerrar} disabled={its.length === 0}>Cerrar caja</button> : caja.estado === 'cerrada' ? <><button className="sec" onClick={guardarPeso}>Guardar peso</button><button className="ghost" onClick={reabrir}>Reabrir</button></> : <span className="muted small">En pallet: no se puede editar</span>}
        </div>
        {its.length === 0 && caja.estado === 'abierta' && rol === 'admin' && <p className="small" style={{ marginTop: '.75rem' }}><button className="ghost danger sm" onClick={eliminarCaja}>Eliminar caja vacía</button></p>}
      </div>
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}
