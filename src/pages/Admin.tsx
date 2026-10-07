import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { fmt, fecha, fechaHora } from '../components/Layout'

interface OrgAdmin { org_id: string; nombre: string; pais: string | null; tipo: string | null; plan: string; plan_vence: string | null; created_at: string; admin_email: string | null; admin_nombre: string | null; cajas: number; miembros: number }
interface Lead { id: number; nombre: string | null; email: string | null; whatsapp: string | null; organizacion: string | null; pais: string | null; cuando: string | null; origen: string | null; utm: Record<string, string> | null; created_at: string }

// Panel interno de Elías: activar planes a mano y ver leads. Solo lo ve el superadmin (ac_config.superadmin_email).
export function Admin() {
  const [orgs, setOrgs] = useState<OrgAdmin[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [f, setF] = useState({ email: '', plan: 'campana', dias: '90' })

  const cargar = useCallback(async () => {
    setErr(null)
    const [a, b] = await Promise.all([supabase.rpc('ac_admin_orgs'), supabase.rpc('ac_admin_leads')])
    if (a.error) { setErr(mensajeError(a.error)); return }
    setOrgs(a.data ?? []); setLeads(b.data ?? [])
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function activar(e: FormEvent) {
    e.preventDefault(); setMsg(null); setErr(null)
    const { data, error } = await supabase.rpc('ac_admin_activar', { p_email: f.email.trim(), p_plan: f.plan, p_dias: Number(f.dias) })
    if (error) setErr(mensajeError(error))
    else if (data?.ok === false) setErr('No hay ninguna organización cuyo administrador tenga ese correo.')
    else { setMsg(`Listo: ${data.orgs} organización(es) con plan ${f.plan}.`); await cargar() }
  }

  if (err && orgs.length === 0) return <div className="error">{err}</div>
  const kpi = { orgs: orgs.length, pagando: orgs.filter(o => o.plan !== 'gratis' && (!o.plan_vence || new Date(o.plan_vence) > new Date())).length, activas: orgs.filter(o => o.cajas >= 10).length, leads: leads.length }
  return (
    <div className="stack">
      <div><a href="#/mas" className="small">← Más</a><h1>Administración de Acopia</h1></div>
      <div className="kpis">
        <div className="kpi brand"><div className="v">{kpi.orgs}</div><div className="l">Organizaciones</div></div>
        <div className="kpi"><div className="v">{kpi.pagando}</div><div className="l">Con plan pagado</div></div>
        <div className="kpi"><div className="v">{kpi.activas}</div><div className="l">Con 10+ cajas (uso real)</div></div>
        <div className="kpi"><div className="v">{kpi.leads}</div><div className="l">Leads de la landing</div></div>
      </div>
      <form className="card" onSubmit={activar}>
        <h2>Activar plan a mano</h2>
        <p className="muted small">Tras recibir el pago, escribe el correo con el que el cliente creó su cuenta.</p>
        <div className="campos-3">
          <div className="campo" style={{ gridColumn: 'span 3' }}><label>Correo del administrador de la organización</label><input type="email" required value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} /></div>
          <div className="campo"><label>Plan</label><select value={f.plan} onChange={e => setF(x => ({ ...x, plan: e.target.value, dias: e.target.value === 'pro' ? '365' : e.target.value === 'campana' ? '90' : '0' }))}><option value="campana">Campaña</option><option value="pro">Pro</option><option value="gratis">Volver a gratis</option></select></div>
          <div className="campo"><label>Días</label><input inputMode="numeric" value={f.dias} onChange={e => setF(x => ({ ...x, dias: e.target.value }))} /></div>
          <div className="campo" style={{ alignSelf: 'end' }}><button className="block">Activar</button></div>
        </div>
        {err && <div className="error">{err}</div>}{msg && <div className="exito">{msg}</div>}
      </form>
      <div className="card">
        <h2>Organizaciones</h2>
        <div className="tabla-wrap"><table><thead><tr><th>Organización</th><th>Admin</th><th>Plan</th><th className="num">Cajas</th><th className="num">Equipo</th><th>Creada</th></tr></thead>
          <tbody>{orgs.map(o => <tr key={o.org_id}><td><b>{o.nombre}</b><div className="small muted">{o.pais} · {o.tipo}</div></td><td className="small">{o.admin_nombre}<div className="muted">{o.admin_email}</div></td><td><span className={`chip ${o.plan === 'gratis' ? '' : 'ok'}`}>{o.plan}</span>{o.plan_vence ? <div className="small muted">hasta {fecha(o.plan_vence)}</div> : null}</td><td className="num">{fmt(o.cajas)}</td><td className="num">{fmt(o.miembros)}</td><td className="small">{fecha(o.created_at)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <h2>Leads</h2>
        <div className="tabla-wrap"><table><thead><tr><th>Cuándo</th><th>Nombre</th><th>Organización</th><th>Contacto</th><th>País · arranque</th><th>Campaña</th></tr></thead>
          <tbody>{leads.map(l => <tr key={l.id}><td className="small">{fechaHora(l.created_at)}</td><td>{l.nombre}</td><td>{l.organizacion}</td><td className="small">{l.whatsapp ? <a href={`https://wa.me/${l.whatsapp.replace('+', '')}`} target="_blank" rel="noreferrer">{l.whatsapp}</a> : null}<div className="muted">{l.email}</div></td><td className="small">{l.pais} · {l.cuando}</td><td className="small muted">{l.utm?.utm_campaign ?? l.origen}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  )
}
