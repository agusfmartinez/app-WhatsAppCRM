---
name: project-decisions
description: WA CRM Desktop — decisiones de negocio y producto tomadas durante el desarrollo
metadata:
  type: project
---

## Modelo de negocio

- Cada cliente tiene su PROPIA cuenta Kapso (no viven en el proyecto del developer)
- El cliente hace solo: registro Kapso + conectar número WA + copiar API key
- Todo lo demás (templates, campañas, contactos, inbox) se gestiona desde la app
- No hay backend custom — solo Electron + Kapso API + Supabase (auth only)

**Why:** El developer vende la app como producto, no gestiona credenciales de clientes.
**How to apply:** Cualquier feature nueva debe poder usarse sin acceder al panel de Kapso.

### Por qué NO multi-tenant en 1 cuenta (verificado jun 2026 con chat IA de Kapso)

- Free = 1 número conectado + 2000 msgs/mes, billing **por proyecto**.
- PERO el "1 número gratis" es beneficio **una sola vez en la vida de la cuenta** (primer proyecto default). Crear N proyectos NO da N números gratis.
- Desconectar/borrar el número NO reinicia el claim gratis; reemplazo puede requerir depósito.
- Conclusión: multi-tenant gratis (vos hosteás muchos clientes en tu cuenta) **no es viable**. Cada cliente necesita su propia cuenta Kapso.
- Multi-tenant real (Inbox Embeds scopeado por customer, muchos números) recién sirve en Pro (3 núm) / Platform (50 núm) = pago.
- Onboarding implementado: **wizard 3 pasos** (crear cuenta → pegar API key → conectar número via **Setup Link**). Reordenado: la key va ANTES del número (chicken-egg: primera key es manual).
- **Setup Links** (NO scraping): con la API key la app hace `GET /platform/v1/customers` (1 customer por cuenta free; crea uno si no existe) → `POST /customers/{id}/setup_links {language:'es', theme_config}` → abre la URL hosted → el cliente hace el embedded signup de Meta ahí → la app pollea `detectNumbers` cada 5s hasta detectar el número → conecta + guarda. Ver [[kapso-inbox-quirks]] (todo meta-proxy envuelve en `data`; platform v1 igual).
- Adapter: `KapsoAdapter.createOnboardingLink(apiKey)` (static). IPC `crm:whatsapp:create-setup-link`. Wizard en `src/components/OnboardingWizard.jsx`, gateado desde Layout (sin api key + no conectado → se muestra).
- **PENDIENTE VERIFICAR EN VIVO:** shape de create-customer (`{customer:{name}}`) y de setup_links response (`data.url`) son best-guess del openapi — no testeado contra la API real todavía.

## Cobertura API Kapso planeada

- ✅ Send template message (campaigns)
- ✅ List/create templates
- ✅ Auto-detect phone numbers (List phone numbers)
- ✅ List messages (inbox polling) — ver [[kapso-inbox-quirks]]
- ✅ List conversations (inbox) — ver [[kapso-inbox-quirks]]
- 🔜 Delete template
- 🔜 Get business profile
- 🔜 Media upload/download (fase 3)

## Sync multi-PC / team (decidido jun 2026)

- DB local (sql.js) es **por PC** → tags, campañas, notas y campos manuales NO sincronizan entre máquinas.
- Lo que SÍ converge: conversaciones, mensajes, contactos WA y templates (viven en Kapso, ambas PCs pollean).
- **Decisión:** mantener local-first por ahora (single-user/1 PC). NO migrar a Supabase todavía.
- **Roadmap futuro:** planes diferenciados — básico (local, esta versión) vs pro (multi-PC, CRM data en Supabase opción 3). Posibles versiones alternativas de la app. Billing Kapso va aparte del plan de la app.
- Si se hace multi-PC: mover contacts/tags/campaigns a Supabase (ya en stack), replantear licencias (por usuario vs por equipo).

## Campañas → Kapso Broadcasts (decidido jun 2026)

- Reemplazar el loop client-side `sendTemplate` por **Broadcasts API** (Platform v1, `/whatsapp/broadcasts`). Server-side: Kapso maneja throughput, retries, scheduling. App no necesita quedar abierta.
- **Híbrido:** tabla local `campaigns` guarda metadata + `kapso_broadcast_id` + todas las métricas. Se poll-ea `GET broadcast` solo mientras envía; al terminar se snapshot-ea a la tabla. **Freeze opción 3:** refresh manual disponible + auto-freeze a los X días (delivered/read/responded siguen cambiando post-`completed_at`, no congelar de una).
- **Clave:** `whatsapp_template_id` del create acepta el **Meta template ID directo** (el que ya tenemos en `t.id` de getTemplates). El UUID es legacy. NO hay que mapear.
- Flujo: create (name, phone_number_id, whatsapp_template_id=meta_id) → add recipients (≤1000/batch, phone + components params posicional/named) → send | schedule {scheduled_at ISO} → poll GET.
- status enum: draft, scheduled, sending, completed, failed. stats: total_recipients, sent/failed/delivered/read/pending/responded_count, response_rate, started_at, completed_at.
- **Alpha API** — mantener detrás del adapter (un solo lugar para adaptar si rompe).
- El loop `sendTemplate` queda solo para "Probar template" del módulo Templates.

## Decisiones técnicas clave

- sql.js (WASM) no better-sqlite3 → sin prerequisitos de compilación en PC del cliente
- Inbox via POLLING (Platform v1 API) no webhooks → desktop no tiene IP pública
- WhatsApp provider modular (IWhatsAppProvider) → fácil switch de Kapso a otro
- Templates requieren aprobación Meta (24-48hs) → el cliente debe esperar, la app ayuda en el proceso

## Paginación (contrato importante)

- `crm:contacts:list` pagina con `limit`/`offset` **opt-in**: sin `limit` devuelve TODOS. **No poner limit por defecto** — Campañas (selector de segmentación) e Inbox (mapa de enriquecimiento phone→contacto) dependen de recibir todos los contactos.
- Página Contactos: paginada (PAGE_SIZE=50, botón "Cargar más").
- Inbox: convs y mensajes paginados con cursor de Kapso (`after` cuando `paging.next`). "Cargar más conversaciones" / "Cargar mensajes anteriores".
- Templates: paginado con cursor Meta (`after`).
- `crm:campaigns:get` carga TODOS los `campaign_contacts` — todavía no cableado en UI; paginar cuando se construya la vista de detalle.
- Pendiente mejora: picker de contactos en Campañas con búsqueda server-side (hoy carga todos).

## Pendiente: testear shapes en vivo

- Sin verificar contra la API real (best-guess del openapi): `createSetupLink` (POST customers/{id}/setup_links + create-customer fallback), `updateBusinessProfile`, `submitDisplayName` / `getDisplayNameRequests`. Probar con cuenta real cuando se pueda y ajustar shapes si fallan.

## Pendientes de decisión

- Nombre definitivo de la app (bloquea Supabase project, GitHub, installer)
- Precio / modelo de licencia
- ¿Soporte de media en campañas? (requiere media templates Meta)
