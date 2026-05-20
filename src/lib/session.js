// src/lib/session.js

import { fetchWithAuth } from './api'

const TOKEN_KEY = 'bp_token'
const SESSION_ID_KEY = 'bp_session_id'

let inFlight = false;

export function getStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY) || null
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || null
  if (!token || !sessionId) return { token: null, sessionId: null }
  return { token, sessionId }
}

export function storeSession(token, sessionId) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(SESSION_ID_KEY, sessionId)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(SESSION_ID_KEY)
}

export async function initBackendSession({ accessToken, endpoint = '/api/session/init', appInfo = null } = {}) {
  if (!accessToken) {
    return { ok: false, status: 0, reason: 'missing-token', detail: 'Access token requerido' }
  }
  if (inFlight) {
    return { ok: false, status: 0, reason: 'in-flight' }
  }
  inFlight = true

  const existing = localStorage.getItem(SESSION_ID_KEY) || null;

  let response
  try {
    if (!appInfo && typeof window !== 'undefined' && window.api?.getAppInfo) {
      try {
        appInfo = await window.api.getAppInfo()
      } catch {
        appInfo = null
      }
    }

    const payload = appInfo && typeof appInfo === 'object'
      ? {
          appVersion: appInfo.appVersion,
          deviceName: appInfo.deviceName,
          os: appInfo.os,
        }
      : {}

    response = await fetchWithAuth(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(existing ? { 'x-session-id': existing } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    inFlight = false
    return { ok: false, status: 0, reason: 'network-error', detail: error?.message || String(error) }
  }

  const rawBody = await response.text()
  let data = null
  try {
    data = rawBody ? JSON.parse(rawBody) : null
  } catch {
    data = rawBody || null
  }

  if (response.status === 403) {
    clearSession()
    inFlight = false
    return { ok: false, status: 403, reason: 'forbidden', detail: data }
  }

  if (!response.ok) {
    clearSession()
    inFlight = false
    return {
      ok: false,
      status: response.status,
      reason: 'error',
      detail: data,
    }
  }

  const sessionId = data?.sessionId
  if (!sessionId) {
    clearSession()
    inFlight = false
    return { ok: false, status: response.status, reason: 'invalid-payload', detail: data }
  }

  storeSession(accessToken, sessionId)
  inFlight = false
  return { ok: true, status: response.status, sessionId }
}
