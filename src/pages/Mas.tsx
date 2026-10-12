import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import * as db from '../lib/db'
import type { Incidencia, Miembro } from '../lib/supabase'
import { CHECKOUT, SOPORTE_EMAIL, mensajeError, planVigente, PLANES, supabase } from '../lib/supabase'
import { Toast, Vacio, fechaHora, fecha } from '../components/Layout'

function useToast() {
  const [t, setT] = useState<{ msg: string; tipo?: 'ok' | 'err' } | null>(null)
  const mostrar = useCallback((msg: string, tipo?: 'ok' | 'err') => { setT({ msg, tipo }); setTimeout(() => setT(null), 3000) }, [])
  return { toast: t, mostrar }
}

export function Mas() {
  const { org, rol, session, salir } = useStore()
  const plan = org ? planVigente(org) : 'gratis'
  const [superadmin, setSuperadmin] = useState(false)
  useEffect(() => { supabase.rpc('ac_soy_superadmin').then(r => setSuperadmin(r.data === true)) }, [])
  const items = [
    ['/stock', '📊', 'Stock por producto', 'Cuánto hay en bodega de cada producto'],
    ['/lia', '💬', 'Lía, tu asistente', 'Te guía paso a paso y responde dudas al instante'],
    ['/incidencias', '⚠️', 'Incidencias', 'Cajas inexistentes o duplicadas al paletizar'],
    ['/equipo', '👥', 'Equipo', 'Invitar voluntarios con un código'],
    ['/bodegas', '🏭', 'Bodegas', 'Centros de acopio y prefijos'],
    ['/plan', '⭐', `Plan: ${PLANES[plan].nombre}`, plan === 'gratis' ? 'Desde US$19 al mes · Comunidad gratis en emergencias' : 'Ver estado del plan'],
    ...(superadmin ? [['/admin', '🛠', 'Administración de Acopia', 'Organizaciones, leads y activación de planes']] : []),
  ]
  return (
    <div className="stack">
      <h1>Más</h1>
      <div className="lista">{items.map(([h, i, t, s]) => <a key={h} href={`#${h}`} className="item"><span style={{ fontSize: '1.4rem' }}>{i}</span><div className="grow"><b>{t}</b><div className="sub">{s}</div></div><span className="muted">›</span></a>)}</div>
      <div className="card">
        <div className="muted small">Sesión: {session?.user.email} · rol {rol}</div>
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button className="sec sm" onClick={salir}>Cerrar sesión</button>
          <a className="btn sec sm" href={`mailto:${SOPORTE_EMAIL}?subject=${encodeURIComponent(`Acopia · ${org?.nombre ?? ''}`)}`}>Soporte por correo</a>
        </div>
      </div>
    </div>
  )
}

export function Incidencias() {
  const { org } = useStore()
  const [lista, setLista] = useState<Incidencia[]>([])
  const cargar = useCallback(async () => { if (org) setLista(await db.incidencias(org.id)) }, [org])
  useEffect(() => { void cargar() }, [cargar])
  const nombres: Record<string, string> = { caja_inexistente: 'Caja no existe', caja_ya_paletizada: 'Caja en otro pallet', pallet_cerrado: 'Pallet cerrado' }
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Incidencias</h1></div>
      <p className="muted small">Se registran solas cuando alguien intenta subir una caja que no existe o que ya está en otro pallet. Sirven para auditar el trabajo del día.</p>
      {lista.length === 0 ? <Vacio ico="✅" titulo="Sin incidencias" /> : (
        <div className="lista">{lista.map(i => (
          <div key={i.id} className="item" style={{ opacity: i.resuelta ? .55 : 1 }}>
            <div className="grow"><b>{nombres[i.tipo] ?? i.tipo}</b> <span className="mono">{i.caja_codigo}</span> → <span className="mono">{i.pallet_codigo}</span><div className="sub">{i.detalle} · {fechaHora(i.created_at)}</div></div>
            <button className="ghost sm" onClick={async () => { await db.resolverIncidencia(i.id, !i.resuelta); await cargar() }}>{i.resuelta ? 'Reabrir' : 'Resuelta'}</button>
          </div>
        ))}</div>
      )}
    </div>
  )
}

export function Equipo() {
  const { org, rol, session } = useStore()
  const [lista, setLista] = useState<Miembro[]>([])
  const [codigo, setCodigo] = useState<string | null>(null)
  const [rolInv, setRolInv] = useState('operador')
  const { toast, mostrar } = useToast()
  const cargar = useCallback(async () => { if (org) setLista(await db.miembros(org.id)) }, [org])
  useEffect(() => { void cargar() }, [cargar])
  async function invitar() { if (!org) return; try { setCodigo(await db.crearInvitacion(org.id, rolInv)) } catch (e) { mostrar(mensajeError(e), 'err') } }
  const link = `${window.location.origin}${import.meta.env.BASE_URL}#/`
  const texto = codigo ? `Únete al centro de acopio "${org?.nombre}" en Acopia:\n1) Entra a ${link}\n2) Crea tu cuenta con tu correo\n3) Elige "Tengo un código" y escribe: ${codigo}` : ''
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Equipo</h1></div>
      {rol === 'admin' && (
        <div className="card">
          <h2>Invitar voluntarios</h2>
          <div className="row">
            <select value={rolInv} onChange={e => setRolInv(e.target.value)} style={{ width: 'auto' }}><option value="operador">Operador (registra y paletiza)</option><option value="admin">Administrador</option></select>
            <button onClick={invitar}>Generar código</button>
          </div>
          {codigo && (
            <div className="exito" style={{ marginTop: '.75rem' }}>
              <div>Código: <b className="mono" style={{ fontSize: '1.3rem' }}>{codigo}</b> (vale 30 días, hasta 100 personas)</div>
              <div className="row" style={{ marginTop: '.5rem' }}>
                <button className="sm sec" onClick={() => navigator.clipboard?.writeText(texto).then(() => mostrar('Copiado', 'ok'))}>Copiar instrucciones</button>
                <a className="btn sm sec" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <h2>Miembros ({lista.length})</h2>
        <div className="lista">{lista.map(m => (
          <div key={m.user_id} className="item"><div className="grow"><b>{m.nombre ?? '(sin nombre)'}</b>{m.user_id === session?.user.id ? <span className="chip brand" style={{ marginLeft: 6 }}>tú</span> : null}<div className="sub">{m.rol}</div></div>
            {rol === 'admin' && m.user_id !== session?.user.id && <button className="ghost sm danger" onClick={async () => { if (confirm(`¿Quitar a ${m.nombre ?? 'este miembro'}?`)) { await db.quitarMiembro(m.org_id, m.user_id); await cargar() } }}>Quitar</button>}
          </div>
        ))}</div>
      </div>
      <Toast msg={toast?.msg ?? null} tipo={toast?.tipo} />
    </div>
  )
}

export function Bodegas() {
  const { org, centros, rol, recargar } = useStore()
  const [f, setF] = useState({ nombre: '', prefijo: '' })
  const [err, setErr] = useState<string | null>(null)
  async function crear(e: FormEvent) {
    e.preventDefault(); if (!org) return; setErr(null)
    try { await db.crearCentro(org.id, f.nombre, f.prefijo); setF({ nombre: '', prefijo: '' }); await recargar() } catch (er) { setErr(mensajeError(er)) }
  }
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Bodegas</h1></div>
      <div className="lista">{centros.map(c => (
        <div key={c.id} className="item" style={{ opacity: c.activo ? 1 : .5 }}><div className="grow"><b>{c.nombre}</b> <span className="chip brand">{c.prefijo}</span><div className="sub">Próxima caja {c.prefijo}-{String(c.proxima_caja).padStart(4, '0')} · próximo pallet PAL-{c.prefijo}-{String(c.proximo_pallet).padStart(3, '0')}</div></div>
          {rol === 'admin' && <button className="ghost sm" onClick={async () => { await db.actualizarCentro(c.id, { activo: !c.activo }); await recargar() }}>{c.activo ? 'Desactivar' : 'Activar'}</button>}
        </div>
      ))}</div>
      {rol === 'admin' && (
        <form className="card" onSubmit={crear}>
          <h2>Nueva bodega</h2>
          <div className="campos-2">
            <div className="campo"><label>Nombre</label><input required value={f.nombre} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))} placeholder="Bodega Quinta Normal" /></div>
            <div className="campo"><label>Prefijo</label><input required maxLength={4} value={f.prefijo} onChange={e => setF(x => ({ ...x, prefijo: e.target.value.toUpperCase() }))} placeholder="QN" /></div>
          </div>
          {err && <div className="error">{err}</div>}
          <button>Crear bodega</button>
        </form>
      )}
    </div>
  )
}

export function Plan() {
  const { org, session, oferta, recargar } = useStore()
  const [motivo, setMotivo] = useState('')
  const [enlace, setEnlace] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [abrirComunidad, setAbrirComunidad] = useState(false)
  if (!org) return null
  const plan = planVigente(org)
  const sinTope = oferta.oferta === 'despacho'
  const q = `?checkout[email]=${encodeURIComponent(session?.user.email ?? '')}&checkout[custom][org]=${org.id}`
  const planes = [
    { k: 'gratis', n: 'Gratis', p: 'US$0', d: sinTope ? 'Registra, paletiza e invita a tu equipo sin límite' : 'Para empezar hoy', f: sinTope ? ['Cajas, pallets y bodegas sin límite', 'Usuarios ilimitados', 'Etiquetas QR y listas de empaque', 'Validación al paletizar y panel', 'Despachos: se cierran con un plan'] : ['1 bodega', '150 cajas', '1 despacho', 'Usuarios ilimitados', 'Listas de empaque y QR'] },
    { k: 'emprendedor', n: 'Emprendedor', p: 'US$19', s: 'al mes', d: 'Para empezar a despachar', f: ['Despachos ilimitados con packing list', '1 bodega, hasta 3 usuarios', 'Se activa y renueva solo; cancela cuando quieras', 'Garantía de 30 días'], url: CHECKOUT.emprendedor },
    { k: 'bodega', n: 'Bodega', p: 'US$49', s: 'al mes', d: 'Para operaciones con equipo', f: ['Todo lo de Emprendedor', 'Bodegas y usuarios ilimitados', 'Incidencias y auditoría por operador', 'Resumen por producto con código HS'], url: CHECKOUT.bodega },
    { k: 'temporada', n: 'Temporada', p: 'US$97', s: 'por 90 días', d: 'Ferias, temporada alta, proyectos', f: ['Todo lo de Bodega durante 90 días', 'Pago único, sin renovación'], url: CHECKOUT.temporada },
  ]
  async function activarComunidad(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null)
    try { const r = await db.activarComunidad(org!.id, motivo, enlace); setMsg(`Programa Comunidad activo hasta ${fecha(r.vence)}. Gracias por lo que están haciendo.`); await recargar() } catch (er) { setErr(mensajeError(er)) }
  }
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Plan</h1></div>
      <div className="card">Tu plan actual: <b>{PLANES[plan].nombre}</b>{org.plan_vence && plan !== 'gratis' ? <span className="muted"> · hasta {fecha(org.plan_vence)}</span> : null}
        {org.plan !== 'gratis' && plan === 'gratis' && <div className="aviso">Tu plan {org.plan} venció. Vuelve a activarlo para seguir cerrando despachos.</div>}
        {msg && <div className="exito">{msg}</div>}
      </div>
      {planes.map(p => (
        <div key={p.k} className="card" style={plan === p.k ? { borderColor: 'var(--brand)' } : undefined}>
          <div className="row between"><h2>{p.n}</h2><div><b style={{ fontSize: '1.3rem' }}>{p.p}</b> <span className="muted small">{p.s ?? ''}</span></div></div>
          <p className="muted small">{p.d}</p>
          <ul style={{ margin: '0 0 .75rem 1.1rem', padding: 0 }}>{p.f.map(x => <li key={x}>{x}</li>)}</ul>
          {p.k !== 'gratis' && (p.url ? <a className="btn block accent" href={p.url + q} target="_blank" rel="noreferrer">Activar {p.n} · pago en línea</a> : <button className="block sec" disabled>Pago en línea disponible muy pronto</button>)}
        </div>
      ))}
      <div className="card" style={{ borderStyle: 'dashed' }}>
        <h2>Programa Comunidad</h2>
        <p className="muted small">Si esta bodega es un centro de acopio de emergencia (inundación, terremoto, incendio) o una campaña solidaria, activa el plan completo gratis por 90 días. Sin tarjeta. Una vez por organización.</p>
        {plan === 'comunidad' ? <div className="exito">Comunidad activo hasta {fecha(org.plan_vence)}.</div> : !abrirComunidad ? <button className="sec" onClick={() => setAbrirComunidad(true)}>Activar Comunidad gratis</button> : (
          <form onSubmit={activarComunidad}>
            <div className="campo"><label>¿Qué emergencia o campaña es? (dos frases)</label><textarea rows={3} required value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Centro de acopio por las inundaciones de Chillán, organizado por la junta de vecinos de..." /></div>
            <div className="campo"><label>Enlace público (noticia, redes, sitio) — opcional</label><input value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="https://" /></div>
            {err && <div className="error">{err}</div>}
            <button className="accent">Activar 90 días gratis</button>
          </form>
        )}
      </div>
      <p className="small muted">El pago es en línea con tarjeta y el plan se activa solo, en segundos, con el correo de tu cuenta ({session?.user.email}). Soporte: {SOPORTE_EMAIL} o Lía dentro de la app.</p>
    </div>
  )
}
