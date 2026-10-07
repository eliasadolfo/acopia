import { useEffect, useRef, useState } from 'react'

// Lector de QR con la API BarcodeDetector (Chrome/Android, Safari 17+). Si no existe, se usa el campo de texto.
type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o?: { formats: string[] }) => Detector } }

export const soportaCamara = () => typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia

export function Scanner({ onCodigo, activo }: { onCodigo: (c: string) => void; activo: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const ultimo = useRef<{ c: string; t: number }>({ c: '', t: 0 })

  useEffect(() => {
    if (!activo || !soportaCamara()) return
    let stream: MediaStream | null = null
    let vivo = true
    const det = new window.BarcodeDetector!({ formats: ['qr_code', 'code_128'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current || !vivo) return
        video.current.srcObject = stream
        await video.current.play()
        const tick = async () => {
          if (!vivo || !video.current) return
          try {
            const r = await det.detect(video.current)
            const c = r[0]?.rawValue?.trim()
            if (c && (c !== ultimo.current.c || Date.now() - ultimo.current.t > 2500)) {
              ultimo.current = { c, t: Date.now() }
              if (navigator.vibrate) navigator.vibrate(60)
              onCodigo(c)
            }
          } catch { /* frame no legible */ }
          setTimeout(tick, 250)
        }
        tick()
      } catch (e) { setErr('No se pudo abrir la cámara: ' + (e as Error).message) }
    })()
    return () => { vivo = false; stream?.getTracks().forEach(t => t.stop()) }
  }, [activo, onCodigo])

  if (!activo) return null
  if (!soportaCamara()) return <div className="aviso">Tu navegador no tiene lector de cámara. Escribe el código de la caja.</div>
  return <div className="scanner">{err ? <div className="error">{err}</div> : <video ref={video} muted playsInline />}</div>
}
