# ARCHITECTURE_ROADMAP.md — WA CRM Desktop

## Estado actual

| Fase | Estado |
|---|---|
| Fase 1 — Fundación | ✅ Completa |
| Fase 2 — Conexión WhatsApp (Kapso) | 🔄 En progreso |
| Fase 3 — CRM completo | 🔜 Pendiente |
| Fase 4 — Auth + Licencias | 🔜 Pendiente |
| Fase 5 — Build + Distribución | 🔜 Pendiente |

---

## Fase 1 — Fundación ✅

- Electron shell + seguridad (contextIsolation, sandbox)
- React UI: sidebar dark SaaS + 7 páginas (Dashboard, Contactos, Campañas, Inbox, Reportes, Templates, Configuración)
- SQLite local via sql.js (WASM, sin compilación nativa)
- Esquema DB: contacts, tags, campaign_contacts, campaigns, settings
- WhatsApp provider interface modular (`IWhatsAppProvider`)
- Auto-update via electron-updater (GitHub Releases)
- Auth bypass para desarrollo (`VITE_DEV_BYPASS_AUTH`)
- Branding: WA CRM Desktop, dark theme

**Deuda técnica:**
- `assets/icon.ico` → ícono CAI, reemplazar
- GitHub publish config → actualizar repo cuando se defina nombre final

---

## Fase 2 — Conexión WhatsApp (Kapso) 🔄

**Provider elegido:** Kapso (REST API oficial, cuenta propia por cliente)

**Completado:**
- ✅ KapsoAdapter: connect, disconnect, sendMessage, sendTemplate
- ✅ KapsoAdapter: listConversations, listMessages, deleteTemplate, getTemplates, createTemplate
- ✅ KapsoAdapter: getPhoneNumberDetails (Platform v1), fetchPhoneNumbers (static)
- ✅ KapsoAdapter: listWaContacts, getBusinessProfile, updateBusinessProfile
- ✅ Auto-connect al startup desde settings guardados
- ✅ Settings: "Detectar" → auto-fill phone_number_id + business_account_id
- ✅ Sync contactos Kapso → DB local (con merge de variantes argentinas 549/54)
- ✅ Templates: listar, crear, eliminar desde la app
- ✅ Campañas: envío masivo de templates con delay configurable

**Pendiente:**
- 🔜 Inbox: polling de conversaciones y mensajes reales desde Kapso Platform v1
- 🔜 Inbox: envío de mensajes manuales desde conversación activa
- 🔜 Onboarding wizard: guía para que el cliente configure Kapso (3 pasos)

**Arquitectura de datos:**
```
Kapso (fuente de verdad) ←→ polling cada 30s ←→ Inbox UI
Local DB (fuente de verdad) ←→ CRUD directo  ←→ Contactos, Campañas
```

**Modelo de negocio confirmado:**
- Cada cliente tiene su propia cuenta Kapso (free tier)
- Cliente hace 3 pasos: crear cuenta → conectar número WA → copiar API key
- CRM auto-detecta phone_number_id + business_account_id
- Cliente nunca vuelve a Kapso

---

## Fase 3 — CRM Completo

1. **Tags CRUD** — gestión de etiquetas desde UI (página Settings o panel Contactos)
2. **Import CSV** — parsear CSV → normalizar teléfonos → batch insert contactos
3. **Export CSV** — exportar tabla contacts
4. **Campañas: progreso en tiempo real** — push de estado por contacto durante envío
5. **Campañas: variables por contacto** — mapear `{{1}}` a campo del contacto (nombre, empresa, etc.)
6. **Inbox en tiempo real** — polling activo, notificación de mensajes nuevos

---

## Fase 4 — Auth + Licencias

1. **Nuevo proyecto Supabase** (cuando esté definido el nombre de la app)
2. **Tablas requeridas:**
   - `user_sessions` — control sesión única
   - `whitelist` — usuarios habilitados
   - `user_kapso_config` — api_key, phone_number_id, business_account_id por usuario
   - `app_config` — versión mínima, canal updates, feature flags
3. **Al login:** fetch config Kapso del usuario desde Supabase → auto-connect WhatsApp
4. **Poner `VITE_DEV_BYPASS_AUTH=false`** en producción

---

## Fase 5 — Build + Distribución

1. **`assets/icon.ico`** — generar desde SVG
2. **Actualizar `package.json` build config** — nuevo `owner/repo` GitHub
3. **`.env` producción** — variables reales, `BYPASS_AUTH=false`
4. **Test instalador** — `npm run dist`, instalar NSIS en VM limpia
5. **Auto-update end-to-end** — publicar release GitHub, verificar detección

---

## Decisiones técnicas

| Decisión | Razón |
|---|---|
| sql.js (WASM) no better-sqlite3 | Sin prerequisitos de compilación en PC del cliente |
| HashRouter | Electron sirve via `file://`, history router no funciona |
| Kapso como provider | API oficial WA, free tier viable, REST simple |
| Conversaciones/mensajes via Kapso polling | No hay IP pública en PC del cliente para webhooks |
| Cada cliente su propia cuenta Kapso | Multi-tenant excede free tier; Setup Links descartado por ahora |
| Teléfonos normalizados sin 9 (54+área+número) | Formato wa_id de Kapso; UNIQUE constraint previene duplicados |
| Sync merge: canónico = el que tiene kapso_id | El contacto ya linkeado a Kapso prevalece sobre duplicados locales |

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| WhatsApp bloquea número por spam | Delay configurable entre mensajes, límite batch |
| sql.js más lento que better-sqlite3 | Aceptable para volumen CRM (<50k contactos) |
| Polling de Inbox consume cuota API Kapso | Intervalo 30s, solo cuando Inbox está abierto |
| Free tier Kapso: 2000 conversaciones/mes | Advertir en UI si el cliente se acerca al límite |
