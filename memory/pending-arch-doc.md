---
name: pending-arch-doc
description: Pendiente — documento técnico completo de la arquitectura (para exponer/explicar)
metadata:
  type: project
---

✅ HECHO (jun 2026): el documento existe en **`ARCHITECTURE.md`** (raíz del repo), 21 secciones. Mantenerlo actualizado al evolucionar la arquitectura.

Era: armar un **documento técnico exhaustivo** de toda la arquitectura de la app, para poder **explicarla y exponerla** de forma clara, precisa, justificada y documentada.

Debe cubrir TODO:
- **Stack:** Electron (main/preload/renderer, contextBridge, seguridad), React/Vite, SQLite via sql.js (WASM, por qué).
- **Comunicación:** IPC (ipcMain.handle / window.api), flujo renderer↔main, por qué sin Node en renderer.
- **Datos:** esquema SQLite (contacts, tags, campaigns, campaign_contacts, settings), modelo híbrido local + Kapso, DB-first.
- **APIs / Kapso:** Platform v1 + meta-proxy, adapter `IWhatsAppProvider`/KapsoAdapter, broadcasts, templates, inbox, setup links, display names, logger de trazas.
- **Conexión con el cliente:** onboarding (API key, setup link), auto-detección de número.
- **Auth + licencias:** Supabase (JWT, sesión única, whitelist, app_config), `useAuthGate`.
- **Versionado + distribución:** electron-updater (GitHub releases, canales latest/beta), electron-builder/NSIS, `npm run dist`.
- **Instalación:** requisitos (Node ≥20, Windows), `npm install` (+ Playwright), `npm run dev`/`build`/`dist`.
- Justificaciones de cada decisión técnica (ver [[project-decisions]], [[kapso-inbox-quirks]], ARCHITECTURE_ROADMAP.md, DECISIONS.md).

Objetivo: documento "completísimo", apto para presentación técnica.
