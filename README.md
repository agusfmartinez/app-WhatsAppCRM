# WA CRM Desktop

Aplicación de escritorio para gestión de contactos y campañas de WhatsApp. Local-first, multi-tenant, comercializable.

## Stack

- **Electron** — desktop app (Windows)
- **React + Vite + Tailwind v4** — UI
- **sql.js** — SQLite local (WebAssembly, sin compilación nativa)
- **Supabase** — auth, whitelist, licencias, versioning
- **WhatsApp provider** — capa modular intercambiable (Kapso / WAHA / Baileys)

## Módulos

| Módulo | Descripción |
|---|---|
| Dashboard | KPIs: contactos, mensajes, campañas, tasa de respuesta |
| Contactos | CRUD + etiquetas + búsqueda + import CSV |
| Campañas | Wizard 3 pasos → selección → mensaje → envío masivo |
| Conversaciones | Inbox estilo WhatsApp Web + respuesta manual |
| Reportes | Métricas históricas por campaña |
| Configuración | WhatsApp provider + delays + info de licencia |

## Desarrollo

```bash
npm install
npm run dev
```

Requiere Node.js >= 20.

### Variables de entorno

Copiar `.env.example` → `.env`:

```
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_DEV_BYPASS_AUTH=true   # deshabilitar para producción
```

## Build

```bash
npm run dist        # producción (stable)
npm run dist:beta   # canal beta
```

## Arquitectura

```
Renderer (React)  →  contextBridge (preload.js)  →  Main (Node.js)
                                                       ├── sql.js DB (crm.db en userData)
                                                       ├── WhatsAppManager (provider modular)
                                                       └── electron-updater (GitHub releases)
```

Datos del CRM siempre locales. Supabase solo para control de acceso y versioning.
