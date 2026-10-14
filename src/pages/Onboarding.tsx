import { useState, type FormEvent } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import { mensajeError } from '../lib/supabase'

const PAISES = ['Chile', 'Venezuela', 'Colombia', 'Perú', 'México', 'Argentina', 'Ecuador', 'Bolivia', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'República Dominicana', 'Cuba', 'Uruguay', 'Paraguay', 'España', 'Estados Unidos', 'Otro']
const TIPOS = [['ecommerce', 'Ecommerce / tienda online'], ['distribuidor', 'Distribuidor / mayorista'], ['courier', 'Courier / logística'], ['importador', 'Importador / exportador'], ['acopio', 'Centro de acopio (agro, reciclaje, textil)'], ['fabricante', 'Fabricante / taller'], ['emergencia', 'Centro de acopio de emergencia / campaña solidaria'], ['otro', 'Otro']]

export function Onboarding() {
  const { recargar, salir, session } = useStore()
  const [modo, setModo] = useState<'crear' | 'unirme'>('crear')
  const [f, setF] = useState({ nombre: '', pais: 'Chile', tipo: 'ecommerce', centro: 'Bodega principal', prefijo: 'BP', miNombre: '' })
  const [codigo, setCodigo] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))

  async function crear(e: FormEvent) {
    e.preventDefault(); setErr(null); setCargando(true)
    try {
      if (modo === 'crear') await db.crearOrg(f)
      else await db.unirse(codigo, f.miNombre)
      await recargar()
      window.location.hash = '/panel'
    } catch (e) { setErr(mensajeError(e)) } finally { setCargando(false) }
  }

  return (
    <div className="centrado"><div className="auth">
      <div className="logo">Encajados</div>
      <p className="muted" style={{ textAlign: 'center' }}>Hola {session?.user.email}. Último paso antes de empezar.</p>
      <div className="card">
        <div className="tabs">
          <button type="button" className={modo === 'crear' ? 'activo' : ''} onClick={() => setModo('crear')}>Crear mi bodega</button>
          <button type="button" className={modo === 'unirme' ? 'activo' : ''} onClick={() => setModo('unirme')}>Tengo un código</button>
        </div>
        <form onSubmit={crear}>
          <div className="campo"><label>Tu nombre (aparece en las cajas que registres)</label><input required value={f.miNombre} onChange={e => set('miNombre', e.target.value)} placeholder="Ej: María Pérez" /></div>
          {modo === 'crear' ? (
            <>
              <div className="campo"><label>Nombre de tu negocio u organización</label><input required value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Tienda Ropa Linda SpA" /></div>
              <div className="campos-2">
                <div className="campo"><label>País</label><select value={f.pais} onChange={e => set('pais', e.target.value)}>{PAISES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div className="campo"><label>Tipo</label><select value={f.tipo} onChange={e => set('tipo', e.target.value)}>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div className="campos-2">
                <div className="campo"><label>Primera bodega</label><input required value={f.centro} onChange={e => set('centro', e.target.value)} /></div>
                <div className="campo"><label>Prefijo de cajas</label><input required maxLength={4} value={f.prefijo} onChange={e => set('prefijo', e.target.value.toUpperCase())} placeholder="QN" /></div>
              </div>
              <p className="small muted">Las cajas se numeran solas: <span className="mono">{(f.prefijo || 'XX').toUpperCase()}-0001</span>, <span className="mono">{(f.prefijo || 'XX').toUpperCase()}-0002</span>…</p>
            </>
          ) : (
            <div className="campo"><label>Código de invitación (6 caracteres)</label><input required maxLength={6} className="mono" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="A1B2C3" /></div>
          )}
          {err && <div className="error">{err}</div>}
          <button className="block xl" disabled={cargando}>{cargando ? 'Creando…' : modo === 'crear' ? 'Empezar gratis' : 'Unirme'}</button>
        </form>
      </div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: '1rem' }}><button className="ghost" onClick={salir}>Cerrar sesión</button></p>
    </div></div>
  )
}
