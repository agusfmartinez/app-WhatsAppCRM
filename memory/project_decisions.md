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

## Cobertura API Kapso planeada

- ✅ Send template message (campaigns)
- ✅ List/create templates
- ✅ Auto-detect phone numbers (List phone numbers)
- ✅ List messages (inbox polling) — ver [[kapso-inbox-quirks]]
- ✅ List conversations (inbox) — ver [[kapso-inbox-quirks]]
- 🔜 Delete template
- 🔜 Get business profile
- 🔜 Media upload/download (fase 3)

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

## Pendientes de decisión

- Nombre definitivo de la app (bloquea Supabase project, GitHub, installer)
- Precio / modelo de licencia
- ¿Soporte de media en campañas? (requiere media templates Meta)
