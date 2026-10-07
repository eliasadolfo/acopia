# Acopia — control de cajas, pallets y envíos para centros de acopio

Micro app SaaS (negocio personal de Elías, operada con cuentas de TEM). Nació de la operación real de ayuda humanitaria a Venezuela 2026 (Sheet "Inventario Voluntarios": 2.143 cajas, 83 pallets, 29 t, 127 voluntarios).

Plan de negocio y campaña: `~/Documents/Empresas/Acopia/PLAN_NEGOCIO.md`.

## Stack

- **Frontend:** Vite + React 19 + TypeScript, sin router externo (hash `#/cajas/<id>`), QR con `qrcode`, lector de cámara con `BarcodeDetector` (fallback: escribir el código). PWA instalable (`public/manifest.webmanifest`).
- **Backend:** Supabase (Auth + Postgres + RLS). Tablas `ac_*`, RPCs con correlativos atómicos (`ac_crear_caja`, `ac_crear_pallet`), validación al paletizar (`ac_paletizar` registra incidencias), panel (`ac_panel`), packing list con HS (`ac_packing_envio`), límites por plan (`ac_limites`).
- **Automatización:** n8n (devn8n.tuescuelademarcas.cl), tag `ACOPIA`:
  - `ACOPIA — Lead landing (webhook)` id `R8oEtoPL8BSvscSd` → `POST /webhook/acopia-lead`: guarda en `ac_leads`, correo de bienvenida (Gmail TEM), aviso Telegram con link de WhatsApp listo.
  - `ACOPIA — Pago Lemon Squeezy (webhook)` id `udKHofcyI2tN8IMT` → `POST /webhook/acopia-pago`: verifica firma HMAC, activa plan por correo (`ac_activar_por_email` con cabecera `x-acopia-token`), avisa por Telegram.
- **Admin interno:** en la app, Más → Administración (solo `ac_config.superadmin_email`): activar planes a mano, ver organizaciones y leads.

## Dónde vive cada cosa

| Pieza | Ubicación |
|---|---|
| Código | `~/Desktop/Acopia` · GitHub `eliasadolfo/acopia` (privado) |
| Base de datos | Supabase **temporal** en el proyecto `tem-redes` (`dnrtibaxaereffchibco`), tablas con prefijo `ac_`. Mover a proyecto propio `acopia` cuando se libere cupo o se pase a Pro (ver abajo). |
| Esquema | `supabase/migrations/001_esquema.sql`, `002` índices globales, `003` activación/leads, `004` superadmin (aplicadas el 7-oct-2026) |
| Semilla global | `supabase/seed/002_seed_global.sql` (7.949 entradas de diccionario, 9 categorías, 89 HS) |
| Secretos | `~/.config/edutrauma/secretos.env`: `ACOPIA_ACTIVACION_TOKEN`, `ACOPIA_LEMON_WEBHOOK_SECRET` |
| Usuario QA | `supabase/pruebas/usuario_qa.txt` (fuera de git) |

## Correr en local

```bash
cp .env.example .env   # ya existe con el proyecto temporal
npm install
npm run dev            # http://localhost:5173/app/
```

## Publicar

`scripts/empaquetar.sh` construye `dist/` (app en `dist/app`, landing en la raíz). Variables: `BASE=/` con dominio propio, `BASE=/acopia/` en GitHub Pages sin dominio.

- **GitHub Pages:** workflow `.github/workflows/pages.yml` (requiere repo público o plan GitHub Pro; fijar `vars.BASE`, `vars.CHECKOUT_*` en Settings → Variables).
- **Vercel:** `vercel.json` listo; el conector MCP no tiene permiso para crear proyectos (crear el proyecto desde el dashboard apuntando al repo; build `npm run build && cp -R landing/. dist/`, output `dist`, env `VITE_*`).
- **Dominio propuesto:** acopia.app (US$9,99 el primer año en Vercel, renueva US$15).

## Mover la base a un proyecto Supabase propio

1. Crear proyecto `acopia` (región `sa-east-1`).
2. Aplicar `supabase/migrations/001..004` y la semilla.
3. Exportar `ac_*` del proyecto temporal (`pg_dump --data-only -t 'public.ac_*'`) e importar; migrar usuarios con la API admin de Auth.
4. Cambiar `VITE_SUPABASE_*` en `.env`, GitHub vars y los dos workflows de n8n (URL + apikey).
5. Insertar `token_activacion` y `superadmin_email` en `ac_config`.

## Pendientes conocidos

- Confirmación de correo en Supabase Auth: desactivarla o configurar SMTP propio (el correo integrado de Supabase tiene tope de pocos envíos por hora).
- Píxel de Meta en `landing/index.html` (marcador `META_PIXEL`) y en `index.html` de la app.
- Links de checkout (`VITE_CHECKOUT_CAMPANA`, `VITE_CHECKOUT_PRO`) cuando exista la pasarela; mientras tanto el botón manda a WhatsApp.
- Cola offline para registrar cajas sin señal (prometida como "en desarrollo" en la landing).
