import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, LIA_URL, mensajeError } from '../lib/supabase'
import { useStore } from '../store'

interface Msg { rol: 'user' | 'assistant'; texto: string }

// Lía: asistente dentro de la app. Guía paso a paso con el estado real de la cuenta y responde dudas de producto y planes.
export function Lia() {
  const { org, session } = useStore()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) return
    supabase.rpc('ac_chat_leer', { p_clave: `app:${session.user.id}`, p_limite: 30 }).then(r => {
      const m = (r.data?.mensajes ?? []) as { rol: 'user' | 'assistant'; texto: string }[]
      setMsgs(m.length ? m : [{ rol: 'assistant', texto: `Hola, soy Lía, la asistente de Encajados. Puedo guiarte paso a paso para dejar tu bodega operando: crear bodegas, registrar la primera caja, armar un pallet o cerrar un despacho. ¿En qué estás ahora?` }])
    })
  }, [session])
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, cargando])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim(); if (!t || cargando || !session) return
    setTexto(''); setErr(null)
    setMsgs(m => [...m, { rol: 'user', texto: t }]); setCargando(true)
    try {
      const r = await fetch(LIA_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: session.access_token, texto: t, org: org?.id ?? null }) })
      if (!r.ok) throw new Error(`Lía no respondió (${r.status})`)
      const j = await r.json()
      setMsgs(m => [...m, { rol: 'assistant', texto: String(j.respuesta || 'No pude responder ahora. Inténtalo de nuevo en un momento.') }])
    } catch (er) { setErr(mensajeError(er)) } finally { setCargando(false) }
  }

  const sugerencias = ['¿Cómo registro mi primera caja?', '¿Cómo imprimo las etiquetas QR?', '¿Qué plan me conviene?', '¿Cómo saco el packing list?']
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Lía</h1><div className="muted small">Asistente de Encajados · responde en segundos</div></div>
      <div className="card" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.rol === 'user' ? 'var(--brand-soft)' : 'var(--surface-2)', borderRadius: 14, padding: '.6rem .85rem', whiteSpace: 'pre-wrap' }}>{m.texto}</div>
        ))}
        {cargando && <div className="muted small">Lía está escribiendo…</div>}
        {err && <div className="error">{err}</div>}
        <div ref={fin} />
      </div>
      {msgs.length <= 1 && <div className="row">{sugerencias.map(s => <button key={s} className="sec sm" onClick={() => setTexto(s)}>{s}</button>)}</div>}
      <form onSubmit={enviar} className="row">
        <input className="grow" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escríbele a Lía…" />
        <button disabled={cargando || !texto.trim()}>Enviar</button>
      </form>
    </div>
  )
}
