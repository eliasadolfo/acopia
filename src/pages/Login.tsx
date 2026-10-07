import { useState, type FormEvent } from 'react'
import { supabase, mensajeError, configurado } from '../lib/supabase'

export function Login() {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErr(null); setOk(null); setCargando(true)
    try {
      if (modo === 'crear') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pass, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
        if (error) throw error
        if (!data.session) setOk('Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
        if (error) throw error
      }
    } catch (e) { setErr(mensajeError(e)) } finally { setCargando(false) }
  }

  async function recuperar() {
    if (!email.trim()) { setErr('Escribe tu correo y vuelve a pulsar "Olvidé mi contraseña"'); return }
    setErr(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + import.meta.env.BASE_URL + '#/clave' })
    if (error) setErr(mensajeError(error)); else setOk('Te enviamos un correo para cambiar la contraseña.')
  }

  return (
    <div className="centrado">
      <div className="auth">
        <div className="logo">Acopia</div>
        <p className="muted" style={{ textAlign: 'center' }}>Cajas, pallets y envíos de tu centro de acopio, bajo control.</p>
        {!configurado && <div className="error">Falta configurar la conexión (variables VITE_SUPABASE_*).</div>}
        <div className="card">
          <div className="tabs">
            <button type="button" className={modo === 'entrar' ? 'activo' : ''} onClick={() => setModo('entrar')}>Entrar</button>
            <button type="button" className={modo === 'crear' ? 'activo' : ''} onClick={() => setModo('crear')}>Crear cuenta</button>
          </div>
          <form onSubmit={enviar}>
            <div className="campo"><label htmlFor="email">Correo</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="campo"><label htmlFor="pass">Contraseña</label><input id="pass" type="password" autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} required minLength={6} value={pass} onChange={e => setPass(e.target.value)} /></div>
            {err && <div className="error">{err}</div>}
            {ok && <div className="exito">{ok}</div>}
            <button className="block xl" disabled={cargando}>{cargando ? 'Un momento…' : modo === 'crear' ? 'Crear cuenta gratis' : 'Entrar'}</button>
          </form>
          {modo === 'entrar' && <button type="button" className="ghost block" style={{ marginTop: '.5rem' }} onClick={recuperar}>Olvidé mi contraseña</button>}
        </div>
        <p className="small muted" style={{ textAlign: 'center', marginTop: '1rem' }}>¿Te invitaron a una organización? Crea tu cuenta y luego ingresa el código.</p>
        <p className="small muted" style={{ textAlign: 'center' }}><a href="../">Volver al sitio</a></p>
      </div>
    </div>
  )
}

export function CambiarClave() {
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  async function guardar(e: FormEvent) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: pass })
    if (error) setErr(mensajeError(error)); else { setMsg('Contraseña actualizada.'); window.location.hash = '/panel' }
  }
  return (
    <div className="centrado"><div className="auth"><div className="card">
      <h2>Nueva contraseña</h2>
      <form onSubmit={guardar}>
        <div className="campo"><label htmlFor="np">Contraseña nueva</label><input id="np" type="password" minLength={6} required value={pass} onChange={e => setPass(e.target.value)} /></div>
        {err && <div className="error">{err}</div>}{msg && <div className="exito">{msg}</div>}
        <button className="block">Guardar</button>
      </form>
    </div></div></div>
  )
}
