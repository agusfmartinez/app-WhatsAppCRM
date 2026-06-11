# Arquitectura Técnica — WA CRM Desktop

> Documento técnico completo de la aplicación: stack, capas, comunicación, datos,
> integración con Kapso, autenticación, distribución e instalación.
> Pensado para exposición y explicación técnica.

---

## 1. Resumen

**WA CRM Desktop** es una aplicación de escritorio (Windows) que funciona como **CRM + gestor de campañas de WhatsApp**. Es **local-first**: los datos del CRM viven en una base SQLite en la máquina del cliente; la mensajería de WhatsApp se realiza contra **Kapso** (proveedor oficial de la WhatsApp Business API); y la **autenticación/licenciamiento** se resuelve contra **Supabase** + un backend propio.

Tres dominios de datos, deliberadamente separados:

| Dominio | Dónde vive | Fuente de verdad |
|---|---|---|
| CRM (contactos, tags, campañas) | SQLite local | Local |
| WhatsApp (conversaciones, mensajes, templates, broadcasts) | Kapso (cloud) | Kapso |
| Auth / licencias / config de versión | Supabase + backend | Cloud |

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Por qué |
|---|---|---|---|
| Shell de escritorio | **Electron** | 40 | Una sola base de código web empaquetada como app nativa Windows; acceso a FS, auto-update, ventanas. |
| UI | **React** | 19 | Componentes declarativos, ecosistema maduro. |
| Bundler / dev server | **Vite** | 7 | HMR rápido en dev, build optimizado a `dist/`. |
| Routing | **react-router-dom** (HashRouter) | 7 | Electron sirve por `file://`; el history router no funciona con `file://`, **HashRouter** sí. |
| Estilos | **Tailwind CSS** (`@tailwindcss/vite`) | 4 | Utility-first, sin CSS suelto. |
| DB local | **sql.js** (SQLite compilado a WASM) | 1.12 | SQLite **sin binarios nativos** → no requiere compilación en la PC del cliente (a diferencia de better-sqlite3). |
| Auth | **@supabase/supabase-js** | 2 | JWT, Realtime para sesión única. |
| Auto-update | **electron-updater** | 6 | Updates desde GitHub Releases, canales latest/beta. |
| Empaquetado | **electron-builder** | 26 | Instalador NSIS para Windows + publish a GitHub. |
| Versionado semver | **semver** | 7 | Comparar versión instalada vs mínima requerida. |

**Runtime:** Node.js ≥ 20, Windows (target NSIS).

---

## 3. Arquitectura de tres capas

El renderer **no tiene acceso a Node**. Todo pasa por el `contextBridge` del preload.

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER (React / Vite)  — sandbox, sin Node                │
│    window.api.*      ← contextBridge (preload.js)            │
│    window.updater.*                                          │
└───────────────┬─────────────────────────────────────────────┘
                │  ipcRenderer.invoke(channel, payload) → { ok, ... }
                │  win.webContents.send(channel, data)   (push)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (electron/main.js)                             │
│    ipcMain.handle(...)                                       │
│    ├── initDb()  → SQLite (sql.js)  → crm.db                 │
│    ├── initCrm(ipcMain, waManager)  → handlers CRM           │
│    ├── WhatsAppManager → KapsoAdapter (IWhatsAppProvider)    │
│    ├── electron-updater (GitHub releases)                    │
│    └── logger / crashLogger                                  │
└───────────────┬─────────────────────────────────────────────┘
                │  HTTPS (fetch)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  CLOUD                                                       │
│    Kapso  (api.kapso.ai)  — WhatsApp Business API            │
│    Supabase + backend (VITE_API_URL) — auth, sesión, config  │
└─────────────────────────────────────────────────────────────┘
```

**Regla de oro:** el renderer nunca importa APIs de Node. Para exponer una capacidad nueva: (1) handler en `electron/`, (2) exponerlo en `preload.js` bajo `window.api`.

---

## 4. Proceso Main (`electron/main.js`)

Punto de entrada (`package.json` → `"main": "electron/main.js"`). Responsabilidades:

- **Ciclo de vida** (`app.whenReady`): inicializa logger → crashLogger → **SQLite** → registra **IPC** → `tryAutoConnect()` → crea splash + ventana → inicia auto-update.
  - Los handlers IPC se registran **antes** de crear la ventana (el renderer puede invocar IPC apenas carga).
- **Ventana** (`createWindow`): `BrowserWindow` 1280×800 con `webPreferences` endurecido (ver §19). En dev carga `http://localhost:5173`; en prod `dist/index.html`.
- **Auto-connect** (`tryAutoConnect`): lee `wa_api_key` / `wa_api_url` (phone_number_id) / `wa_business_account_id` desde la tabla `settings` y conecta el proveedor WhatsApp al arrancar, sin intervención del usuario.
- **Push al renderer:** eventos del proveedor (`status`, `qr`, `message`, `error`) se reenvían con `win.webContents.send('whatsapp:event', event)`.
- **Crash handling:** `uncaughtException` / `unhandledRejection` → `crashLogger` + log.
- **Cierre** (`will-quit`): `closeDb()` persiste y cierra la DB.

---

## 5. Preload (`electron/preload.js`) — `window.api`

Único puente renderer↔main, vía `contextBridge.exposeInMainWorld`. Expone:

- `window.api`:
  - `getAppInfo`, `openExternal`
  - `contacts.*` (list/get/create/update/delete/stats/import)
  - `tags.*` (list/create/update/delete)
  - `campaigns.*` (list/get/create/send/refreshStats/importBroadcasts/recipients/cancel/delete)
  - `settings.*` (get/getAll/set)
  - `whatsapp.*` (connect/disconnect/getStatus, sendMessage/sendTemplate, listConversations/listMessages, getTemplates/createTemplate/deleteTemplate, getBusinessProfile/updateBusinessProfile, getDisplayNameRequests/submitDisplayName, createBroadcast/.../listBroadcasts/listBroadcastRecipients, getPhoneNumberDetails, detectNumbers, createSetupLink, etc.)
  - `syncKapsoContacts`
  - listeners de eventos WhatsApp (`onWhatsAppEvent`/`offWhatsAppEvent`)
- `window.updater`: `onUpdateEvent`, `checkForUpdates`, `forceCheck`, `setChannel`, `downloadUpdate`, `installUpdate`.

Todas las llamadas renderer→main siguen el patrón `ipcRenderer.invoke(channel, payload) → { ok, ... }`.

---

## 6. Renderer (React / Vite)

- Entrada: `src/main.jsx` → `createRoot`. Envuelto en `UpdateProvider` → `HashRouter` → `DialogProvider` → `Root`.
- **Routing** (`HashRouter`): rutas públicas (`/login`, `/signup`, `/pending`) y privadas bajo `<Layout>` (dashboard, contacts, inbox, campaigns, `campaigns/:id`, templates, reports, settings).
- **Layout** (`src/components/Layout.jsx`): sidebar + `<Outlet>`. Gatilla el **wizard de onboarding** si no hay API key y no está conectado.
- **DialogProvider** (`src/components/Dialog.jsx`): reemplaza `alert`/`confirm` nativos por un modal propio (`useDialog().alert/confirm`, con promesa).
- Páginas en `src/pages/`: Dashboard, Contacts, Campaigns, CampaignDetail, Inbox, Templates, Reports, Settings, Login, Signup, Pending.

---

## 7. Comunicación IPC — contrato

- **Renderer → Main:** `ipcRenderer.invoke(channel, payload)` → devuelve `{ ok, ... }` (o el dato directo en lecturas simples).
- **Main → Renderer (push):** `win.webContents.send(channel, data)`; el renderer escucha con `ipcRenderer.on`.
- Canales agrupados por prefijo: `crm:contacts:*`, `crm:tags:*`, `crm:campaigns:*`, `crm:settings:*`, `crm:whatsapp:*`, `app:*`, `update:*`.
- Handlers CRM registrados en `electron/ipc/crm.ipc.js` (`initCrm(ipcMain, waManager)`).

> **Importante (dev):** el proceso main **no** tiene HMR. Cambios en `electron/*` (main, preload, ipc, adapter, db) requieren **reiniciar Electron** (`electron .`). El renderer sí hace HMR vía Vite.

---

## 8. Capa de datos — SQLite (sql.js)

**`electron/db/database.js`:**
- Carga `sql.js` (WASM). El `.wasm` se ubica con `locateFile`: en dev desde `node_modules`, en prod desde `app.asar.unpacked` (por eso `asarUnpack` en el build).
- La DB es un **archivo** en `app.getPath('userData')/crm.db`. Se lee a un buffer al iniciar; cada escritura persiste con `saveDb()` (`db.export()` → `fs.writeFileSync`).
- `PRAGMA foreign_keys = ON`. Migraciones aditivas vía `applyMigrations`.

**`electron/db/schema.js`** — tablas:
- `contacts` (id, name, phone UNIQUE, email, company, notes, kapso_id, wa_name, timestamps)
- `tags` (id, name UNIQUE, color)
- `contact_tags` (contact_id, tag_id) — N:N
- `campaigns` (+ columnas de broadcast: kapso_broadcast_id, template_id, total/sent/delivered/read/responded/pending/error counts, response_rate, scheduled/started/completed_at, stats_frozen, origin)
- `campaign_contacts` (campaign_id, contact_id, status, params, sent/delivered/read/responded/failed_at, error_message)
- `settings` (key, value) — config WhatsApp, campañas, broadcasts descartados.

**`electron/db/migrations.js`:** ejecuta el `SCHEMA_SQL` + una lista de `ALTER TABLE ADD COLUMN` idempotentes (SQLite tira error en duplicado → se ignora). Así se evoluciona el esquema sin romper DBs existentes.

**Por qué sql.js y no better-sqlite3:** better-sqlite3 es un módulo nativo → requeriría toolchain de compilación / prebuilds en la PC del cliente. sql.js (WASM) corre en cualquier lado sin compilar. Trade-off: la DB se carga entera en memoria y se persiste por volcado completo; aceptable para el volumen de un CRM (< ~50k contactos).

---

## 9. Proveedor WhatsApp — interfaz + manager + adapter

Diseño **modular** para no acoplar el CRM a un proveedor concreto.

- **`IWhatsAppProvider`** (`electron/whatsapp/IWhatsAppProvider.js`): clase base (`EventEmitter`). Define el contrato (`connect`, `disconnect`, `sendMessage`, `getStatus`, …) y los eventos (`status`, `qr`, `message`, `error`).
- **`WhatsAppManager`** (`electron/whatsapp/WhatsAppManager.js`): registra el adapter activo, reenvía sus eventos al renderer y **delega** cada método (`_delegate`). Mapa `PROVIDERS = { kapso: KapsoAdapter }` — extensible a WAHA/Baileys sin tocar el CRM.
- **`KapsoAdapter`** (`electron/whatsapp/providers/KapsoAdapter.js`): implementa la interfaz contra la API de Kapso. El CRM nunca importa el adapter directo: pasa por el manager.

Esto permite cambiar de proveedor cambiando una línea del mapa, manteniendo el contrato.

---

## 10. Integración con Kapso

Dos bases de URL:
- **Meta proxy:** `https://api.kapso.ai/meta/whatsapp/v24.0` — espeja la Graph API de Meta (templates, conversaciones por número, business profile, block users).
- **Platform v1:** `https://api.kapso.ai/platform/v1` — API propia de Kapso (mensajes con `direction`, phone numbers, **broadcasts**, customers, setup links, display names).

Auth: header `X-API-Key`.

Funcionalidades cubiertas por el adapter:
- **Mensajería:** `sendMessage` (texto, ventana 24h), `sendTemplate`.
- **Inbox:** `listConversations`, `listMessages` (Platform v1, trae `kapso.direction` confiable). El inbox usa **polling** (la app no tiene IP pública para webhooks).
- **Templates:** list/create/delete (Meta proxy). El create soporta header/body/footer/botones (QUICK_REPLY/URL/PHONE_NUMBER) y ejemplos para revisión de Meta.
- **Broadcasts** (campañas server-side, Platform v1, *alpha*): create → addRecipients (≤1000/batch) → send | schedule | cancel → get (poll de stats) → listRecipients. `whatsapp_template_id` acepta el **Meta template id** directo.
- **Perfil/número:** `getPhoneNumberDetails`, `getBusinessProfile`/`updateBusinessProfile`, display name requests.
- **Onboarding:** `detectNumbers` (fetchPhoneNumbers), `createOnboardingLink` (customers + setup_links).
- **Trazas:** todo fetch pasa por `tracedFetch`/`traceApi` → consola dev + archivo `kapso-api.log` (método, URL, status, ms; secretos redactados). Base para exportar trazas.

---

## 11. Modelo de datos híbrido (DB-first)

- **CRM puro** (contactos, tags, campañas, settings) = SQLite local, CRUD directo.
- **WhatsApp** (conversaciones, mensajes, templates, broadcasts) = Kapso, fuente de verdad.
- **Campañas (híbrido):** la campaña se crea como **draft local**; al enviar se materializa el broadcast en Kapso. Las métricas se **snapshot-ean** a la DB local (poll mientras `sending`; **auto-freeze a los 3 días** post-completed). Una vez congelada, se sirve de DB sin volver a la API.
- **DB-first:** abrir la lista de campañas o de contactos **no** pega a la API; sólo el sync manual ("Importar de Kapso" / "Sincronizar"), el detalle de campañas activas y el polling del inbox lo hacen. Decisión consciente para minimizar consumo de cuota Kapso.

---

## 12. Onboarding / conexión del cliente

Modelo de negocio: **cada cliente tiene su propia cuenta Kapso** (free tier ⇒ 1 número, 2000 msg/mes; el beneficio de número gratis es **una vez por cuenta**, por eso no sirve multi-tenant en una sola cuenta).

Wizard de 3 pasos (`src/components/OnboardingWizard.jsx`), gatillado desde el Layout si no hay API key:
1. **Crear cuenta Kapso** (abre el signup con `openExternal`).
2. **Pegar API key** (de Settings → API & Webhooks en Kapso); se valida con `detectNumbers`.
3. **Conectar número** vía **Setup Link** hosted (Kapso genera la página de embedded signup de Meta); la app **poll-ea** `detectNumbers` hasta detectar el número conectado, lo guarda y conecta.

El número (`phone_number_id`) y la WABA (`business_account_id`) se autodetectan; el cliente no vuelve a Kapso.

---

## 13. Autenticación + licencias (Supabase)

Flujo en `src/main.jsx` → hook `useAuthGate`:
1. `supabase.auth.onAuthStateChange` dispara en login.
2. `initBackendSession` (`src/lib/session.js`, POST `/api/session/init` con `Authorization: Bearer <jwt>`) → devuelve `sessionId`; se guarda en `localStorage` (`bp_token`, `bp_session_id`).
3. **Sesión única:** se suscribe al canal Realtime `user_sessions`; si el `session_id` remoto cambia (login en otra máquina) → `signOut` + redirect a `/login`.
4. Errores: **403** → `/pending` (no whitelisted); **401** → `SessionExpired`.
5. `fetchAppConfig` carga versión mínima / canal / `force_update` y dispara `electron-updater`.

**Separación clave:** Supabase/backend sólo manejan auth, licencia y config de versión. **Ningún dato de CRM** sale de la máquina. (Implicancia: no hay sync multi-PC del CRM; decidido como pendiente para un plan "pro" con datos en Supabase.)

Tablas backend previstas: `user_sessions` (sesión única), `whitelist` (habilitados), `user_kapso_config`, `app_config` (versión mínima, canal, flags).

---

## 14. Logging + crash handling

- **`electron/logger.js`:** logger multi-scope a archivo (`<userData>/logs/<user>/app.log`). Scopes: MAIN, IPC, SECURITY, RENDERER. **Redacta secretos** (Bearer, tokens) antes de escribir. `createLogger({ file, scope })`.
- **`kapso-api.log`:** trazas de todas las llamadas a Kapso (§10).
- **`electron/crashLogger.js`:** captura `uncaughtException` / `unhandledRejection`.
- Los logs del renderer se reenvían a archivo vía el evento `console-message` del `webContents`.

---

## 15. Auto-update (electron-updater)

- Lee releases de **GitHub** (`publish` en `package.json` → `owner/repo`).
- Dos **canales**: `latest` / `beta`, seteables en runtime (`window.updater.setChannel`).
- El backend (`app_config`) controla `channel`, `min_version`, `force_update`; si la versión instalada < mínima o `force_update` → pantalla `ForceUpdate`.
- `main.js` maneja reintentos, throttling (`UPDATE_MIN_INTERVAL_MS`), supresión temporal y buffer de logs del updater.

---

## 16. Build + distribución

`package.json` → `build` (electron-builder):
- `appId: com.wacrm.desktop`, `productName: WA CRM Desktop`.
- `asar: true` + `asarUnpack: node_modules/sql.js/dist/**` (el WASM debe quedar fuera del asar para poder localizarlo).
- `files`: `dist/**` (build de Vite) + `electron/**`.
- `win.target: nsis` (instalador Windows).
- `publish`: GitHub.

Comandos:
- `npm run dist` → `vite build` + `electron-builder --publish always` (instalador NSIS + sube a GitHub Releases).
- `npm run dist:beta` → igual, canal `beta`.

Flujo de release: bump de versión → `npm run dist` → GitHub Release → clientes reciben update vía electron-updater según canal y `min_version`.

---

## 17. Instalación + comandos (dev)

Requisitos: **Node ≥ 20**, Windows.

```bash
npm install      # instala deps (+ postinstall si aplica)
npm run dev      # Vite en :5173 + Electron (concurrent, wait-on)
npm run build    # build de producción de Vite → dist/
npm run dist     # build + instalador NSIS (publica a GitHub)
```

`dev` corre dos procesos en paralelo (`concurrently`): `vite` y, cuando `:5173` responde (`wait-on`), `electron .` con `ELECTRON_DEV=true`.

---

## 18. Variables de entorno

Copiar `.env.example` → `.env`:

```
VITE_API_URL=            # backend propio (session init, tracking)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Runtime (seteadas por el main): `APP_PACKAGED`, y las históricas de Playwright (`PLAYWRIGHT_BROWSERS_PATH`, `BVIP_COOKIES_*`) heredadas del proyecto base.

---

## 19. Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`.
- `setWindowOpenHandler` → **deny** a `window.open` (los links externos van por `shell.openExternal`, validado a http/https).
- `will-navigate` → sólo permite `file://` (prod) o `localhost:5173` (dev); cualquier otra navegación se bloquea y loguea.
- Renderer sin Node; todo capability pasa por el preload.
- Secretos redactados en logs.
- API keys de Kapso guardadas en la DB local (settings), no salen a la nube.

---

## 20. Decisiones técnicas (justificadas)

| Decisión | Razón |
|---|---|
| sql.js (WASM) en vez de better-sqlite3 | Sin compilación nativa en la PC del cliente. |
| HashRouter | Electron sirve por `file://`; history router no funciona. |
| Kapso como proveedor (detrás de `IWhatsAppProvider`) | API oficial WA, free tier viable, REST simple; intercambiable. |
| Inbox por polling, no webhooks | La app desktop no tiene IP pública para recibir webhooks. |
| Campañas → Kapso Broadcasts (híbrido + snapshot local) | Envío server-side, scheduling, métricas (delivered/read/responded) que el loop cliente no capturaba; snapshot evita re-consultar la API. |
| `whatsapp_template_id` = Meta id directo | Kapso lo acepta; evita mapear el UUID interno. |
| DB-first (sin auto-sync/auto-import) | Minimizar consumo de cuota Kapso; la lista carga de local. |
| Cada cliente su cuenta Kapso | Multi-tenant excede el free tier (1 número/cuenta, beneficio único). |
| CRM local, auth en Supabase | Privacidad de datos del cliente; Supabase sólo auth/licencia. |
| Modal propio (DialogProvider) | UX consistente; reemplaza `alert`/`confirm` nativos. |

---

## 21. Limitaciones conocidas / pendientes

- **Sin sync multi-PC del CRM** (DB local por máquina). Plan futuro: datos CRM en Supabase para un tier "pro".
- **Inbox sin tiempo real** (polling). Recepción vía webhook requiere IP pública / relay — pendiente de análisis.
- **Broadcasts API en alpha** (Kapso) — encapsulado en el adapter para adaptar si cambia.
- **Shapes sin testear en vivo:** setup-link, updateBusinessProfile, display-name (best-guess del openapi).
- **Editor de Workflows** (canvas con nodos, IA) — pendiente de análisis.
- Ícono e `owner/repo` de publish heredados del proyecto base — actualizar al definir nombre final.

---

*Referencias en el repo: `CLAUDE.md`, `ARCHITECTURE_ROADMAP.md`, `DECISIONS.md`, y `memory/` (decisiones de producto y quirks de Kapso).*
