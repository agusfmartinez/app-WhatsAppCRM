# ARCHITECTURE_ROADMAP.md — WA CRM Desktop

## Estado actual

| Fase | Estado |
|---|---|
| Fase 1 — Fundación | ✅ Completa |
| Fase 2 — Conexión WhatsApp | ⏳ Siguiente |
| Fase 3 — CRM completo | 🔜 Pendiente |
| Fase 4 — Auth + Licencias | 🔜 Pendiente |
| Fase 5 — Build + Distribución | 🔜 Pendiente |

---

## Fase 1 — Fundación ✅

**Qué se hizo:**
- Electron shell: ventana, seguridad (contextIsolation, sandbox), splash screen
- React UI: sidebar dark SaaS + 6 páginas (Dashboard, Contactos, Campañas, Inbox, Reportes, Configuración)
- SQLite local via sql.js (WASM, sin compilación nativa)
- Esquema DB: contacts, tags, conversations, messages, campaigns, settings
- Capa IPC completa: CRUD contactos, campañas, mensajes, settings
- WhatsApp provider interface modular (`IWhatsAppProvider`)
- Auto-update via electron-updater (GitHub Releases)
- Auth bypass para desarrollo (`VITE_DEV_BYPASS_AUTH`)
- Branding: WA CRM Desktop, dark theme, limpieza total de refs CAI

**Deuda técnica conocida:**
- `assets/icon.ico` sigue siendo el ícono CAI → reemplazar con herramienta externa
- GitHub publish config apunta al repo anterior → actualizar cuando se cree el nuevo

---

## Fase 2 — Conexión WhatsApp ⏳ (SIGUIENTE)

**Objetivo:** Poder enviar y recibir mensajes reales de WhatsApp desde la app.

**Decisión crítica: provider a implementar**

| Provider | Pros | Contras |
|---|---|---|
| **WAHA** (recomendado para dev) | Docker, REST API simple, gratis, sin cuenta WhatsApp Business | Requiere Docker corriendo en la PC del cliente |
| **Kapso** | API oficial, más estable | Pago, requiere cuenta WhatsApp Business |
| **Baileys** | 100% local, sin Docker | No oficial, puede quebrarse con updates de WA |

**Tareas Fase 2:**

1. **Implementar WahaAdapter** (`electron/whatsapp/providers/WahaAdapter.js`)
   - `connect()` → GET /api/sessions → POST /api/sessions/start
   - `sendMessage()` → POST /api/sendText
   - Webhook: recibir mensajes entrantes via HTTP endpoint local
   - Emitir eventos: `status`, `qr`, `message`

2. **HTTP server local** para webhook (`electron/whatsapp/webhook.js`)
   - Express o http nativo, puerto configurable (default 3001)
   - Endpoint POST `/webhook` → procesa mensajes entrantes → guarda en DB → emite `whatsapp:event` al renderer

3. **QR code en Settings**
   - Cuando status = `qr`, mostrar el QR en la página Settings
   - Usar librería `qrcode` para renderizar

4. **Conversaciones automáticas**
   - Mensaje entrante → buscar contacto por phone → crear/actualizar conversation → guardar message
   - Inbox muestra updates en tiempo real via `onWhatsAppEvent`

5. **Settings: guardar config y conectar**
   - Al guardar Settings, ejecutar `window.api.whatsapp.connect({ providerName, config })`
   - Persistir config en DB settings table

**Dependencias nuevas:**
```
npm install qrcode express
```

**Diagrama Fase 2:**
```
WhatsApp (red) ←→ WAHA (Docker) ←→ WahaAdapter ←→ WhatsAppManager
                                                          ↓
                                                  webhook HTTP server
                                                          ↓
                                                    DB (messages)
                                                          ↓
                                             IPC → renderer (Inbox live)
```

---

## Fase 3 — CRM Completo

1. **Tags CRUD** desde UI (página Settings o panel en Contactos)
2. **Import CSV** — parsear CSV → validar → batch insert contactos
3. **Export CSV** — exportar tabla contacts a archivo
4. **Campaign delay + batch**
   - Leer `campaign_delay` y `campaign_batch` de settings
   - Enviar en lotes con delay entre mensajes (actualmente envía todo de golpe)
5. **Progress en tiempo real** — campaign send pushea progreso al renderer via IPC push
6. **Búsqueda en Inbox** — filtrar conversaciones por nombre/número

---

## Fase 4 — Auth + Licencias

1. **Nuevo proyecto Supabase** (cuando esté definido el nombre de la app)
2. **Tablas requeridas:**
   - `user_sessions` — control sesión única
   - `whitelist` — usuarios habilitados
   - `licenses` — estado activo/inactivo por usuario
   - `app_config` — versión mínima, canal de updates, feature flags
3. **Poner `VITE_DEV_BYPASS_AUTH=false`** en producción
4. **Backend de sesión** — el endpoint `/api/session/init` ya está integrado en el cliente, solo necesita el servidor
5. **Feature flag:** licencia → bloquear módulos de pago si expirada

---

## Fase 5 — Build + Distribución

1. **Nuevo `assets/icon.ico`** — generar desde SVG con herramienta (ImageMagick, icoconvert.com)
2. **Actualizar `package.json` build config** — nuevo `owner/repo` en GitHub publish
3. **`.env` de producción** — variables reales, `BYPASS_AUTH=false`
4. **Test del instalador** — `npm run dist`, instalar NSIS en VM limpia
5. **Auto-update end-to-end** — publicar release en GitHub, verificar que la app detecta y descarga
6. **Code signing** (opcional) — evitar warnings de Windows Defender SmartScreen

---

## Decisiones técnicas tomadas

| Decisión | Razón |
|---|---|
| sql.js en lugar de better-sqlite3 | Sin dependencia nativa → corre en cualquier PC sin VS Build Tools |
| HashRouter en React | Electron sirve via `file://`, history router no funciona |
| Provider como interface + adapters | Cambiar de WAHA a Kapso sin tocar CRM |
| Supabase solo para cloud control | CRM siempre local, sin dependencia de internet para usar la app |
| VITE_DEV_BYPASS_AUTH | Desarrollo sin bloqueo mientras Supabase no está configurado |

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| WhatsApp bloquea número por spam masivo | Delay entre mensajes, límite de batch, avisar al usuario |
| WAHA requiere Docker en PC del cliente | Documentar, o migrar a Kapso/Baileys si el cliente no tiene Docker |
| sql.js más lento que better-sqlite3 en writes pesados | Aceptable para volumen de CRM (<50k contactos); escalar a better-sqlite3 si se necesita |
| Tamaño del .exe grande por sql.js WASM | ~3MB de overhead; aceptable |
