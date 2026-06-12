---
name: pending-workflows-webhooks
description: Pendientes a analizar — editor de workflows tipo canvas + recepción de mensajes vía webhook
metadata:
  type: project
---

Dos features futuras **a analizar factibilidad y enfoque** (no implementar aún):

## 1. Editor de Workflows (canvas con nodos)

- Construir algo similar a los **Workflows de Kapso**: un canvas visual con nodos, acciones, ramas, etc.
- Objetivo a futuro: integrar **recepción de mensajes** + **IA** (responder/automatizar).
- Pendiente entender cómo funciona en Kapso (Kapso tiene API de Workflows / WhatsApp Flows — revisar docs). Evaluar si reusar lo de Kapso o construir propio.

## 2. Recepción de mensajes (webhooks)

- Para recibir mensajes entrantes se debería **exponer un webhook** y asignarlo a la línea de Kapso (Kapso tiene endpoints de webhooks: subscribe/list/test).
- **Problema clave (ya conocido):** la app es desktop local, **sin IP pública** → no puede recibir webhooks directo. Por eso hoy el inbox usa **polling**.
- A analizar opciones: túnel (ngrok-like), relay/cloud propio que reciba el webhook y lo reenvíe, o usar features de Kapso (Inbox Embeds / polling mejorado). Ver [[kapso-inbox-quirks]] (webhooks descartados por falta de IP pública) y [[project-decisions]].
- Conecta con el punto 1: la recepción alimentaría los workflows/IA.

## 3. Kapso Functions = backend serverless SIN infra propia (clave, jun 2026)

- **Kapso Functions** corren en **Cloudflare Workers hosteados por Kapso** (no necesitás server/cloud propio). Resuelve el "no backend propio hasta ser redituable": el backend lo pone Kapso.
- Capacidades: handler `fetch` (request/response, NO `export default`), `env.KV` (key-value persistente por proyecto), `env.DB` (Cloudflare D1), `env.SECRET` (secrets encriptados), `fetch()` saliente.
- URL invoke: `https://api.kapso.ai/platform/v1/functions/{function_id}/invoke` (con `X-API-Key`, o `public_endpoint:true` sin key). `invoke_response_mode: passthrough` para respuesta sin wrapper `{data}`.
- Se adjuntan a: nodos de workflow, tools de agente, o se llaman directo. Útiles como **webhook handler** (Kapso les manda `whatsapp.message.received` por header `X-Webhook-Event`).
- **Sirven para #1 (workflows/IA) y #2 (webhooks)** sin infra propia: auto-responder, taggear, sync CRM, lógica de negocio — todo server-side 24/7.
- **NO dan push a la desktop:** son request/response, no mantienen conexión con la PC NAT'eada. Para enterarte seguís **pulleando** (invoke o listMessages) → latencia = intervalo de poll. (Teórico: Cloudflare Durable Objects harían WS server, pero el modelo de Functions de Kapso no los expone.)
- **CLI de Kapso aún no maneja functions** — crear/deploy via dashboard o API.

## Inbox realtime (resuelto sin infra, jun 2026)

- Decisión: **NO backend propio hasta ser redituable**. Todo local en la PC del cliente.
- Implementado: poller en el main (20s) → notificación nativa Electron + evento al renderer; conversación abierta pollea cada 5s (pausada si ventana oculta); lista 30s. Las API reads **no consumen** la cuota de 2000 msgs (solo cuentan mensajes WA). Se siente tipo WhatsApp Web. Push real recién con relay/Functions+WS (futuro).
- ✅ HECHO: toggle en Settings para activar/desactivar notificaciones (opt-in, default off); poller respeta el flag; silencia si la conversación está abierta y visible.

## Pendientes UI/UX varios (jun 2026)

- **Timestamp en los logs de consola dev:** el archivo `app.log`/`kapso-api.log` ya tiene timestamp ISO, pero los `console.log` (`[kapso-api]`, `[inbox-poller]`) NO. Agregar prefijo de fecha/hora a esos console logs para ver cuándo pasó cada cosa.
- **Detalles de la conversación (Inbox):** botón en el **header del chat** que abre un **panel lateral** con datos de la conversación (estilo inbox de Kapso): nombre/teléfono/BSUID del contacto, `last_seen_at`, estado (si fue **cerrada/ended**), assignment, notas. Ver `get-conversation` de Kapso (Platform v1) para los campos.
