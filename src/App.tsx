import { useStore } from './store'
import { useRuta } from './lib/router'
import { Layout } from './components/Layout'
import { Login, CambiarClave } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Panel } from './pages/Panel'
import { Cajas, CajaDetalle } from './pages/Cajas'
import { Pallets, PalletDetalle } from './pages/Pallets'
import { Envios, EnvioDetalle } from './pages/Envios'
import { Mas, Incidencias, Equipo, Bodegas, Plan } from './pages/Mas'
import { Admin } from './pages/Admin'
import { Lia } from './pages/Lia'

export default function App() {
  const { cargando, session, org } = useStore()
  const ruta = useRuta()
  const [s, id] = ruta.partes

  if (cargando) return <div className="centrado"><div className="muted">Cargando…</div></div>
  if (!session) return <Login />
  if (s === 'clave') return <CambiarClave />
  if (!org) return <Onboarding />

  let pagina
  switch (s) {
    case 'cajas': pagina = id ? <CajaDetalle id={id} /> : <Cajas />; break
    case 'pallets': pagina = id ? <PalletDetalle id={id} /> : <Pallets />; break
    case 'envios': pagina = id ? <EnvioDetalle id={id} /> : <Envios />; break
    case 'incidencias': pagina = <Incidencias />; break
    case 'equipo': pagina = <Equipo />; break
    case 'bodegas': pagina = <Bodegas />; break
    case 'plan': pagina = <Plan />; break
    case 'mas': pagina = <Mas />; break
    case 'admin': pagina = <Admin />; break
    case 'lia': pagina = <Lia />; break
    default: pagina = <Panel />
  }
  return <Layout>{pagina}</Layout>
}
