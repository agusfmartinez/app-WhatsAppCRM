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
