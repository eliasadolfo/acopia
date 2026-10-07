import QRCode from 'qrcode'
import type { Caja, Item, Pallet } from './supabase'

async function qr(texto: string): Promise<string> {
  try { return await QRCode.toDataURL(texto, { margin: 0, width: 220, errorCorrectionLevel: 'M' }) } catch { return '' }
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const num = (n: number | null | undefined, d = 0) => (n == null ? '' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: d }))

function imprimirHtml(html: string) {
  let cont = document.getElementById('impresion')
  if (!cont) { cont = document.createElement('div'); cont.id = 'impresion'; cont.className = 'impresion'; document.body.appendChild(cont) }
  cont.innerHTML = html
  // Esperar a que carguen los QR antes de abrir el diálogo
  const imgs = Array.from(cont.querySelectorAll('img'))
  Promise.all(imgs.map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = () => r(null) })))).then(() => {
    window.print()
  })
}

/** Lista de empaque por caja: una hoja por caja, con QR del código. */
export async function imprimirCajas(cajas: { caja: Caja; items: Item[]; centro: string; org: string }[]) {
  const hojas = await Promise.all(cajas.map(async ({ caja, items, centro, org }) => {
    const q = await qr(caja.codigo)
    const filas = items.map(i => `<tr><td style="text-align:right">${num(i.cantidad)}</td><td>${esc(i.canonica || i.descripcion)}${i.canonica && i.canonica !== i.descripcion ? `<br><small>${esc(i.descripcion)}</small>` : ''}</td><td>${esc(i.marca)}</td><td>${esc(i.unidad)}</td><td>${esc(i.categoria)}</td></tr>`).join('')
    return `<section class="hoja">
      <div class="cab">
        <div><h1>LISTA DE EMPAQUE</h1><div>${esc(org)} · ${esc(centro)}</div><div>Fecha: ${new Date().toLocaleDateString('es-CL')} · Operador: ${esc(caja.operador_nombre ?? '')}</div>${caja.peso_kg ? `<div>Peso: ${num(caja.peso_kg, 2)} kg</div>` : ''}</div>
        <div style="text-align:center">${q ? `<img src="${q}" alt="">` : ''}<div class="cod">${esc(caja.codigo)}</div></div>
      </div>
      <table><thead><tr><th>Cant.</th><th>Descripción</th><th>Marca / fabricante</th><th>Unidad</th><th>Categoría</th></tr></thead><tbody>${filas || '<tr><td colspan="5">Sin ítems</td></tr>'}</tbody></table>
      <div class="pie"><span>${items.length} líneas · ${num(items.reduce((a, b) => a + Number(b.cantidad), 0))} unidades</span><span>Generado con Acopia</span></div>
    </section>`
  }))
  imprimirHtml(hojas.join(''))
}

/** Contenido de un pallet: cabecera con QR y tabla de cajas con sus ítems. */
export async function imprimirPallet(p: { pallet: Pallet; cajas: Caja[]; items: Item[]; centro: string; org: string }) {
  const q = await qr(p.pallet.codigo)
  const porCaja = new Map<string, Item[]>()
  p.items.forEach(i => porCaja.set(i.caja_id, [...(porCaja.get(i.caja_id) ?? []), i]))
  const pesoCajas = p.cajas.reduce((a, c) => a + Number(c.peso_kg ?? 0), 0)
  const filas = p.cajas.map(c => {
    const its = porCaja.get(c.id) ?? []
    return `<tr><td class="mono"><b>${esc(c.codigo)}</b></td><td style="text-align:right">${num(c.peso_kg, 2)}</td><td>${its.map(i => `${num(i.cantidad)} × ${esc(i.canonica || i.descripcion)}${i.unidad ? ` (${esc(i.unidad)})` : ''}`).join('<br>') || '—'}</td></tr>`
  }).join('')
  const dims = p.pallet.largo_cm ? `${p.pallet.largo_cm}×${p.pallet.ancho_cm}×${p.pallet.alto_cm} cm` : ''
  imprimirHtml(`<section class="hoja">
    <div class="cab">
      <div><h1>CONTENIDO DE PALLET</h1><div>${esc(p.org)} · ${esc(p.centro)}</div><div>Fecha: ${new Date().toLocaleDateString('es-CL')} · Operador: ${esc(p.pallet.operador_nombre ?? '')}</div><div>${p.cajas.length} cajas · ${num(pesoCajas, 2)} kg mercadería${p.pallet.tara_kg ? ` + ${num(p.pallet.tara_kg, 2)} kg tara` : ''}${dims ? ` · ${dims}` : ''}</div></div>
      <div style="text-align:center">${q ? `<img src="${q}" alt="">` : ''}<div class="cod">${esc(p.pallet.codigo)}</div></div>
    </div>
    <table><thead><tr><th>Caja</th><th>Peso (kg)</th><th>Contenido</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="pie"><span>Estado: ${p.pallet.estado.toUpperCase()}</span><span>Generado con Acopia</span></div>
  </section>`)
}

/** Etiquetas de caja (solo código + QR), 1 por hoja, para pegar en la caja. */
export async function imprimirEtiquetas(cajas: { codigo: string; centro: string }[]) {
  const hojas = await Promise.all(cajas.map(async c => {
    const q = await qr(c.codigo)
    return `<section class="hoja" style="text-align:center;padding-top:30mm"><img src="${q}" style="width:70mm;height:70mm" alt=""><div class="cod" style="font-size:40pt">${esc(c.codigo)}</div><div>${esc(c.centro)}</div></section>`
  }))
  imprimirHtml(hojas.join(''))
}

export function descargarCSV(nombre: string, filas: (string | number | null | undefined)[][]) {
  const csv = filas.map(f => f.map(v => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
