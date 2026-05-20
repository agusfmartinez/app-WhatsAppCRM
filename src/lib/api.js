// src/lib/api.js

const API_URL = import.meta.env.VITE_API_URL

export function fetchWithAuth(path, options = {}) {
  const token = localStorage.getItem('bp_token')
  const sessionId = localStorage.getItem('bp_session_id')
  const appVersion = typeof window !== 'undefined'
    ? (window.__APP_VERSION__ || localStorage.getItem('bp_app_version'))
    : null
  const hasAuthHeader = !!(options.headers && (
    'Authorization' in options.headers || 'authorization' in options.headers
  ))
  const headers = {
    ...(options.headers || {}),
    'Content-Type': 'application/json',
    ...(!hasAuthHeader && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sessionId ? { 'x-session-id': sessionId } : {}),
    ...(appVersion ? { 'x-app-version': appVersion } : {}),
    'x-client': 'desktop',
  }
  return fetch(`${API_URL}${path}`, { ...options, headers }).then(async (res) => {
    if (res.status === 426 && typeof window !== 'undefined') {
      let minVersion = null
      try {
        const cloned = res.clone()
        const data = await cloned.json()
        minVersion = data?.min_version || data?.minVersion || null
      } catch {}
      try {
        const payload = {
          forced: true,
          min_version: minVersion || window.__APP_CONFIG__?.min_version || null,
          ts: Date.now(),
        }
        localStorage.setItem('bp_force_update', JSON.stringify(payload))
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('force-update'))
      } catch {}
    }
    return res
  })
}
