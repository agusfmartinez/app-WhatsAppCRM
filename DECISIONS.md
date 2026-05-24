# DECISIONS.md — WA CRM Desktop

Decisiones de producto, negocio y técnicas. Se actualiza a medida que evoluciona el proyecto.

---

## Modelo de negocio

### Clientes independientes en Kapso
**Decisión:** Cada cliente tiene su propia cuenta Kapso con su propia API key. No hay una cuenta central del developer.

**Implicación:** La app debe guiar al cliente a conectar su propia cuenta Kapso. El developer no gestiona las credenciales de los clientes.

**Lo que el cliente hace en Kapso (mínimo inevitable):**
1. Registrarse en Kapso
2. Conectar su número de WhatsApp Business
3. Copiar su API key → pegar en la app

**Todo lo demás se gestiona desde la app:**
- Detectar phone_number_id + business_account_id automáticamente (botón "Detectar")
- Listar, crear y eliminar templates
- Ver y gestionar conversaciones
- Enviar mensajes y campañas
- Ver perfil del negocio
- Gestionar contactos bloqueados

---

## Cobertura de la API de Kapso

Mapa de qué endpoints de Kapso usamos/usaremos desde la app:

| Grupo | Endpoint | Estado | Uso en app |
|---|---|---|---|
| **Messages** | GET List messages | 🔜 Fase 3 | Inbox: historial de mensajes |
| **Messages** | POST Send a message | ✅ Implementado | Manual reply en Inbox |
| **Messages** | GET Get message by ID | — | No prioritario |
| **Conversations** | GET List conversations | 🔜 Fase 3 | Inbox: lista de chats |
| **Conversations** | GET Get conversation details | 🔜 Fase 3 | Inbox: detalle de chat |
| **Contacts** | GET List contacts | 🔜 Fase 3 | Sync contactos Kapso → CRM local |
| **Contacts** | GET Get contact details | — | No prioritario |
| **Templates** | GET List templates | ✅ Implementado | Página Templates |
| **Templates** | POST Create/update template | ✅ Implementado | Crear template desde app |
| **Templates** | DEL Delete template | 🔜 Próximo | Eliminar desde app |
| **Templates** | GET Get template by ID | — | No prioritario |
| **Business Profile** | GET Get profile | 🔜 Próximo | Mostrar en Settings |
| **Business Profile** | POST Update profile | 🔜 Futuro | Editar desde app |
| **Block Users** | GET/POST/DEL | 🔜 Futuro | Gestión de bloqueados desde Contactos |
| **Phone Numbers** | GET List | ✅ Implementado | Auto-detect en Settings |
| **Phone Numbers** | GET Get details | 🔜 Próximo | Mostrar estado del número |
| **Phone Numbers** | POST Update settings | 🔜 Futuro | Config avanzada |
| **Media** | POST Upload | 🔜 Fase 3 | Enviar imágenes en conversaciones |
| **Media** | GET Get URL / Download | 🔜 Fase 3 | Ver imágenes recibidas en Inbox |
| **Calls** | GET/POST | 🔜 Futuro | No es prioridad para CRM |
| **Flows** | Full CRUD | 🔜 Futuro | Feature avanzada, post-MVP |

---

## Decisiones técnicas

### SQLite via sql.js (no better-sqlite3)
**Decisión:** Usar sql.js (WebAssembly) en lugar de better-sqlite3 (nativo).
**Razón:** better-sqlite3 requiere compilación con Visual Studio (C++ Build Tools). Los clientes no pueden tener ese prerequisito.
**Trade-off:** sql.js es ~20% más lento en writes pesados. Aceptable para volúmenes CRM (<50k contactos).

### Sin backend propio
**Decisión:** No hay backend custom. Toda la lógica corre en Electron (main process) + Kapso API + Supabase (solo auth).
**Razón:** Simplicidad de despliegue, menores costos, menor superficie de ataque.

### WhatsApp provider modular
**Decisión:** Kapso como provider inicial, con interface `IWhatsAppProvider` para poder cambiar a WAHA, Baileys u otro sin tocar el CRM.
**Razón:** El ecosistema de providers WhatsApp cambia frecuentemente. El CRM no debe acoplarse a uno específico.

### Templates con aprobación de Meta
**Decisión:** Los templates de campaña deben estar aprobados por Meta (no se pueden enviar mensajes arbitrarios a usuarios fuera de la ventana de 24hs).
**Implicación:** Los clientes deben esperar aprobación de Meta (24-48hs). La app gestiona la creación y seguimiento, pero no puede saltear la revisión.

### Inbox: polling vs webhook
**Decisión:** Para recibir mensajes entrantes, usar polling de la Platform v1 API de Kapso en lugar de webhooks.
**Razón:** Los webhooks requieren una URL pública, lo cual no es viable en una app desktop en la PC del cliente.
**Endpoint:** `GET https://api.kapso.ai/platform/v1/whatsapp/messages?phone_number_id=X`

---

## Flujo de onboarding del cliente (objetivo)

```
1. Cliente descarga e instala la app
2. App: pantalla de onboarding → "Necesitás una cuenta de Kapso"
   → Link a registro Kapso
   → Instrucciones para conectar número de WhatsApp
   → Campo para pegar API key → botón "Detectar" → auto-config
3. App: conectada automáticamente a WhatsApp
4. Cliente puede crear templates y esperar aprobación de Meta
5. Una vez aprobado el template → crear campaña → enviar difusión
```

---

## Normalización de teléfonos — Argentina

WhatsApp usa formato `549XXXXXXXXX` para móviles; algunos sistemas guardan `54XXXXXXXXX` (sin el 9).
El sync detecta ambos formatos y los trata como el mismo contacto.
El teléfono guardado en la DB no se modifica — solo se setea `kapso_id` para vincularlo.

Aplica cuando:
- `phone.startsWith('549')` y 13 dígitos → variante sin 9: `54` + resto
- `phone.startsWith('54')` y 12 dígitos → variante con 9: `549` + resto

---

## Pendientes de decisión

- [ ] Nombre definitivo de la app (para crear proyecto Supabase, GitHub, installer)
- [ ] Precio / modelo de licencia por cliente
- [ ] ¿Ofrecer onboarding asistido con Kapso a clientes, o self-service?
- [ ] ¿Soporte de media (imágenes/PDFs) en campañas? (requiere media templates en Meta)
