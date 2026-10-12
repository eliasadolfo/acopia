import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { supabase, mensajeError } from '../lib/supabase'
import { Vacio, fmt } from '../components/Layout'
import { descargarCSV } from '../lib/print'

interface Fila { producto: string; categoria: string; cantidad: number; cajas: number; en_pallet: number; sin_pallet: number }

// Stock por producto: lo que hay en bodega (ítems de cajas que no salieron en un despacho cerrado).
export function Stock() {
  const { org, centros, centroActual } = useStore()
  const [filas, setFilas] = useState<Fila[]>([])
  const [todas, setTodas] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!org) return
    supabase.rpc('ac_stock', { p_org: org.id, p_centro: todas ? null : centroActual?.id ?? null }).then(r => { if (r.error) setErr(mensajeError(r.error)); else setFilas(r.data ?? []) })
  }, [org, centroActual, todas])
  const q = buscar.trim().toLowerCase()
  const lista = q ? filas.filter(f => f.producto.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q)) : filas
  const total = lista.reduce((a, f) => a + Number(f.cantidad), 0)
  return (
    <div className="stack">
      <div className="row between"><div><h1>Stock</h1><div className="muted small">Lo que hay en bodega por producto: cajas registradas que aún no salieron en un despacho cerrado.</div></div>
        <button className="sec sm" onClick={() => descargarCSV('stock.csv', [['Producto', 'Categoría', 'Cantidad', 'Cajas', 'En pallet', 'Sin pallet'], ...lista.map(f => [f.producto, f.categoria, f.cantidad, f.cajas, f.en_pallet, f.sin_pallet])])}>⬇ CSV</button></div>
      <div className="row">
        <input className="grow" placeholder="Buscar producto o categoría" value={buscar} onChange={e => setBuscar(e.target.value)} />
        {centros.filter(c => c.activo).length > 1 && <label className="row" style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto', minHeight: 0 }} checked={todas} onChange={e => setTodas(e.target.checked)} /> Todas las bodegas</label>}
      </div>
      {err && <div className="error">{err}</div>}
      {lista.length === 0 ? <Vacio ico="📊" titulo="Sin stock registrado" texto="Registra cajas con su contenido y aquí verás cuánto hay de cada producto." /> : (
        <div className="card">
          <div className="row between"><h2>{fmt(lista.length)} productos</h2><span className="muted small">{fmt(total)} unidades</span></div>
          <div className="tabla-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th className="num">Cantidad</th><th className="num">Cajas</th><th className="num">En pallet</th><th className="num">Sin pallet</th></tr></thead>
            <tbody>{lista.map(f => <tr key={f.producto + f.categoria}><td><b>{f.producto}</b></td><td><span className="chip">{f.categoria}</span></td><td className="num">{fmt(f.cantidad)}</td><td className="num">{fmt(f.cajas)}</td><td className="num">{fmt(f.en_pallet)}</td><td className="num">{fmt(f.sin_pallet)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  )
}
