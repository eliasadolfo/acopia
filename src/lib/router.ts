import { useEffect, useState } from 'react'

// Router por hash: #/cajas, #/cajas/<id>, #/pallets/<id> ... sin dependencias.
export interface Ruta { path: string; partes: string[]; query: URLSearchParams }

function leer(): Ruta {
  const h = window.location.hash.replace(/^#/, '') || '/'
  const [p, q] = h.split('?')
  const path = p.startsWith('/') ? p : '/' + p
  return { path, partes: path.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') }
}

export function useRuta(): Ruta {
  const [r, setR] = useState<Ruta>(leer)
  useEffect(() => {
    const f = () => setR(leer())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}

export function ir(path: string) {
  window.location.hash = path.startsWith('/') ? path : '/' + path
}
