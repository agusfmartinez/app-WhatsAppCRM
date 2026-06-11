import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  Outlet,
} from 'react-router-dom';
import './styles/index.css';
import { supabase } from './lib/supabase';
import { initBackendSession, clearSession } from './lib/session';
import { fetchAppConfig } from './lib/appConfig';
import { isOutdated } from './utils/version';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contacts from './pages/Contacts.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Inbox from './pages/Inbox.jsx';
import Reports from './pages/Reports.jsx';
import Templates from './pages/Templates.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Pending from './pages/Pending.jsx';
import Signup from './pages/Signup.jsx';
import Loading from './components/Loading.jsx';
import SessionExpired from './components/SessionExpired.jsx';
import ForceUpdate from './components/ForceUpdate.jsx';
import UpdateUI from './components/UpdateUI.jsx';
import { UpdateProvider } from './context/UpdateContext.jsx';

const PUBLIC_ROUTES = ['/login', '/signup', '/pending'];

function useAuthGate() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [expired, setExpired] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const channelRef = useRef(null);
  const expireTimerRef = useRef(null);
  const bootstrappedRef = useRef(false);
  const expiredRef = useRef(false);
  const locationRef = useRef(location.pathname);
  const sessionIdRef = useRef(null);
  const appConfigLoadedRef = useRef(false);

  const cleanupChannel = async () => {
    const ch = channelRef.current;
    if (!ch) return;
    try { await supabase.removeChannel(ch); } catch {}
    channelRef.current = null;
    sessionIdRef.current = null;
  };

  const subscribeUserSession = async (userId, nav, expectedSessionId = null) => {
    await cleanupChannel();
    if (!userId) return;
    sessionIdRef.current = expectedSessionId || localStorage.getItem('bp_session_id') || null;

    const ch = supabase
      .channel(`user-session-watch:${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_sessions', filter: `user_id=eq.${userId}` }, (payload) => {
        const remote = payload?.new?.session_id;
        const local = sessionIdRef.current;
        if (remote && local && remote !== local) {
          supabase.auth.signOut().finally(() => { clearSession(); nav('/login', { replace: true }); });
        }
      });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = ch;
        sessionIdRef.current = expectedSessionId || localStorage.getItem('bp_session_id') || null;
      }
    });
  };

  const handleInitFailure = async (result) => {
    await supabase.auth.signOut();
    clearSession();
    setAllowed(false);
    navigate(result?.reason === 'forbidden' ? '/pending' : '/login', { replace: true });
  };

  const handleExpiredSession = async () => {
    setExpired(true);
    expiredRef.current = true;
    setAllowed(false);
    setBootstrapped(true);
    bootstrappedRef.current = true;
    setReady(true);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    expireTimerRef.current = setTimeout(() => {
      setExpired(false);
      expiredRef.current = false;
      navigate('/login', { replace: true });
    }, 1200);
    try { await supabase.auth.signOut(); } finally { clearSession(); }
  };

  const loadAppConfigOnce = async () => {
    if (appConfigLoadedRef.current) return false;
    appConfigLoadedRef.current = true;
    try {
      const config = await fetchAppConfig();
      window.__APP_CONFIG__ = config;
      try { localStorage.setItem('app_config', JSON.stringify(config)); } catch {}
      try {
        const channel = config?.channel || 'stable';
        await window.updater?.setChannel?.(channel);
        await window.updater?.checkForUpdates?.();
      } catch {}
      try {
        const info = await window.api?.getAppInfo?.();
        if (info?.appVersion) { window.__APP_VERSION__ = info.appVersion; try { localStorage.setItem('bp_app_version', info.appVersion); } catch {} }
        if (config?.force_update || (info?.appVersion && config?.min_version && isOutdated(info.appVersion, config.min_version))) {
          setForceUpdate(true);
          try { await window.updater?.forceCheck?.(); } catch {}
          return true;
        }
      } catch {}
    } catch {
      try {
        const cached = localStorage.getItem('app_config');
        if (cached) window.__APP_CONFIG__ = JSON.parse(cached);
      } catch {}
    }
    return false;
  };

  useEffect(() => { bootstrappedRef.current = bootstrapped; }, [bootstrapped]);
  useEffect(() => { expiredRef.current = expired; }, [expired]);
  useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        cleanupChannel();
        clearSession();
        appConfigLoadedRef.current = false;
        setForceUpdate(false);
        if (window.__APP_CONFIG__) delete window.__APP_CONFIG__;
        setAllowed(false);
        if (bootstrappedRef.current && !expiredRef.current && !PUBLIC_ROUTES.includes(locationRef.current)) {
          navigate('/login', { replace: true });
        }
        return;
      }
      if (event === 'SIGNED_IN') {
        const prevToken = localStorage.getItem('bp_token');
        const curToken = session.access_token;
        if (prevToken && prevToken === curToken) {
          const shouldBlock = await loadAppConfigOnce();
          if (shouldBlock) { setAllowed(false); return; }
          setAllowed(true);
          subscribeUserSession(session.user.id, navigate, localStorage.getItem('bp_session_id'));
          if (['/login', '/pending'].includes(location.pathname)) navigate('/', { replace: true });
          return;
        }
        const result = await initBackendSession({ accessToken: curToken });
        if (!result.ok) {
          if (result.status === 401) { await handleExpiredSession(); return; }
          if (result.reason !== 'in-flight') await handleInitFailure(result);
          return;
        }
        const shouldBlock = await loadAppConfigOnce();
        if (shouldBlock) { setAllowed(false); return; }
        setAllowed(true);
        subscribeUserSession(session.user.id, navigate, result.sessionId);
        if (['/login', '/pending'].includes(locationRef.current)) navigate('/', { replace: true });
      }
    });

    (async () => {
      try {
        const { data: initial } = await supabase.auth.getSession();
        if (initial.session) {
          let session = initial.session;
          const expiresAt = (session.expires_at || 0) * 1000;
          if (expiresAt && Date.now() > expiresAt - 30_000) {
            const { data: refreshed, error } = await supabase.auth.refreshSession();
            if (error || !refreshed?.session) { await handleExpiredSession(); return; }
            session = refreshed.session;
          }
          const result = await initBackendSession({ accessToken: session.access_token });
          if (!result.ok) {
            if (result.status === 401) { await handleExpiredSession(); return; }
            if (result.reason !== 'in-flight') await handleInitFailure(result);
            return;
          }
          const shouldBlock = await loadAppConfigOnce();
          if (shouldBlock) { setAllowed(false); return; }
          setAllowed(true);
          subscribeUserSession(initial.session.user.id, navigate, result.sessionId);
        } else {
          clearSession();
          setAllowed(false);
        }
      } finally {
        setBootstrapped(true);
        bootstrappedRef.current = true;
        setReady(true);
      }
    })();

    return () => { subscription.unsubscribe(); cleanupChannel(); };
  }, []);

  useEffect(() => () => { if (expireTimerRef.current) clearTimeout(expireTimerRef.current); }, []);

  return { ready, allowed, expired, forceUpdate };
}

const CRM_ROUTES = (
  <>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="contacts" element={<Contacts />} />
    <Route path="inbox" element={<Inbox />} />
    <Route path="campaigns" element={<Campaigns />} />
    <Route path="campaigns/:id" element={<CampaignDetail />} />
    <Route path="reports" element={<Reports />} />
    <Route path="templates" element={<Templates />} />
    <Route path="settings" element={<Settings />} />
  </>
);

// Dev bypass — skip Supabase completely
function BypassRoot() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {CRM_ROUTES}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AuthRoot() {
  const { ready, allowed, expired, forceUpdate } = useAuthGate();

  useEffect(() => {
    if (!window.api?.onUpdaterLog) return;
    const handler = (data) => console.log('[UPDATER]', data);
    window.api.subscribeUpdaterLogs?.();
    window.api.onUpdaterLog(handler);
    return () => window.api.offUpdaterLog?.(handler);
  }, []);

  let forced = forceUpdate || window.__FORCE_UPDATE__;
  try {
    const raw = localStorage.getItem('bp_force_update');
    if (raw) { const p = JSON.parse(raw); forced = forced || p?.forced === true; }
  } catch {}

  if (!ready) return <Loading />;
  if (expired) return <SessionExpired />;
  if (forced) return <ForceUpdate />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={allowed ? <Layout /> : <Navigate to="/login" replace />}>
        {CRM_ROUTES}
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function Root() {
  if (import.meta.env.VITE_DEV_BYPASS_AUTH === 'true') return <BypassRoot />;
  return <AuthRoot />;
}

createRoot(document.getElementById('root')).render(
  <UpdateProvider>
    <HashRouter>
      <UpdateUI />
      <Root />
    </HashRouter>
  </UpdateProvider>
);
