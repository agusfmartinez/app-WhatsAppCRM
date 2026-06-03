---
name: kapso-inbox-quirks
description: Limitaciones de la API Kapso descubiertas al construir el inbox (payloads reales)
metadata:
  type: reference
---

Quirks de la API Kapso confirmados por payloads reales del inbox. Ver [[project-decisions]].

## Conversaciones NO traen último mensaje

- Endpoint conversations (`/meta/whatsapp/v24.0/{phone_id}/conversations?fields=kapso()`) **NO** devuelve preview del último mensaje ni timestamp del mismo.
- El objeto conversación **no tiene campo `kapso`**. Los campos van planos: `id`, `contact_name`, `phone_number`, `last_active_at`, `status` (`ended`/activo), `business_scoped_user_id`.
- **Workaround usado:** 1 sola llamada `listMessages({limit:100})` sin `conversation_id` → devuelve mensajes recientes de todas las convs. El mensaje sí trae `kapso.whatsapp_conversation_id`. Se arma mapa `convId → {text, ts}` (primer match = más reciente, vienen newest-first). Sirve para preview Y para ordenar la lista.
- **NO hacer N+1** (un listMessages por conv) — 50 convs × poll cada 30s = carísimo.

## Mensajes (Platform v1)

- `listMessages` usa Platform v1: `/platform/v1/whatsapp/messages?phone_number_id=X[&conversation_id=UUID]`, header `X-API-Key`.
- Payload trae: `kapso.direction` (inbound/outbound), `text.body` / `kapso.content`, `timestamp` (unix segundos como string), `kapso.whatsapp_conversation_id`.
- Platform v1 SIEMPRE incluye `direction` — por eso se migró desde el meta-proxy que no lo daba confiable.

## Imposibles con Kapso actual

- **Badge de no-leídos:** Kapso solo da `status` (`ended`/activo) en la conv, no un count de no leídos. No hay fuente.
- **Guard ventana 24hs:** la app solo muestra aviso visual; no se puede saber con certeza si la ventana está abierta sin trackear el último inbound localmente.
