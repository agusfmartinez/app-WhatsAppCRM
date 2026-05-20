import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link, useLocation } from 'react-router-dom';

const RECENT_EMAILS_KEY = 'bp_recent_emails';
const MAX_RECENT_EMAILS = 6;

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500';
const btn = 'w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export default function Login() {
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [recentEmails, setRecentEmails] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const st = location.state;
    if (st?.email) { setEmail(st.email); if (st.otpSent) setOtpSent(true); return; }
    const pending = sessionStorage.getItem('pendingEmail') || '';
    if (pending) setEmail(pending);
    if (sessionStorage.getItem('otpSent') === '1') setOtpSent(true);
  }, [location.state]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_EMAILS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) setRecentEmails(list);
    } catch {}
  }, []);

  const storeRecentEmail = (value) => {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return;
    const next = [clean, ...recentEmails.filter(e => e !== clean)].slice(0, MAX_RECENT_EMAILS);
    setRecentEmails(next);
    try { localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(next)); } catch {}
  };

  const clearRecentEmails = () => {
    setRecentEmails([]);
    try { localStorage.removeItem(RECENT_EMAILS_KEY); } catch {}
  };

  function mapOtpError(err) {
    const status = err?.status;
    const message = (err?.message || '').toLowerCase();
    if (status === 422 && message.includes('signups not allowed')) return 'Ese correo no está registrado. Registrate primero.';
    if (status === 429) return 'Demasiadas solicitudes. Probá en unos minutos.';
    if (status === 400) return 'Ingresá un email válido.';
    return 'No pudimos enviar el código. Intentá de nuevo.';
  }

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean) return setMsg({ text: 'Ingresá tu email.', type: 'error' });
    setSendingOtp(true); setMsg({ text: '', type: '' });
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: false } });
      if (error) return setMsg({ text: mapOtpError(error), type: 'error' });
      setOtpSent(true);
      storeRecentEmail(clean);
      setMsg({ text: 'Código enviado. Revisá tu correo.', type: 'success' });
    } catch {
      setMsg({ text: 'Error de red. Intentá de nuevo.', type: 'error' });
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyCode() {
    const clean = email.trim().toLowerCase();
    if (!clean) return setMsg({ text: 'Ingresá tu email.', type: 'error' });
    if (!code || code.length !== 6) return setMsg({ text: 'Ingresá el código de 6 dígitos.', type: 'error' });
    setVerifying(true); setMsg({ text: '', type: '' });
    const { error } = await supabase.auth.verifyOtp({ email: clean, token: code, type: 'email' });
    if (error) { setVerifying(false); return setMsg({ text: error.message, type: 'error' }); }
    try {
      sessionStorage.removeItem('pendingEmail');
      sessionStorage.removeItem('otpSent');
      storeRecentEmail(clean);
      navigate('/');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-12 w-12 rounded-xl bg-green-600 flex items-center justify-center">
            <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L.057 23.177a.75.75 0 00.92.92l5.57-1.338A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.18-1.43l-.37-.22-3.834.922.937-3.724-.243-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">WA CRM Desktop</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ingresá con tu correo</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          {/* Email */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Email</label>
            <input
              type="email"
              autoComplete="email"
              list="recent-emails"
              placeholder="tu@email.com"
              className={`${input} mt-1`}
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !otpSent && sendCode()}
            />
            <datalist id="recent-emails">
              {recentEmails.map(item => <option key={item} value={item} />)}
            </datalist>
            {recentEmails.length > 0 && (
              <button type="button" onClick={clearRecentEmails} className="text-xs text-gray-600 hover:text-gray-400 mt-1">
                Borrar recientes
              </button>
            )}
          </div>

          {/* OTP */}
          {otpSent && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Código de 6 dígitos</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                className={`${input} mt-1 tracking-widest text-center text-lg`}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && verifyCode()}
                autoFocus
              />
            </div>
          )}

          {/* Message */}
          {msg.text && (
            <p className={`text-xs px-3 py-2 rounded-lg ${msg.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
              {msg.text}
            </p>
          )}

          {/* Actions */}
          {!otpSent ? (
            <button onClick={sendCode} disabled={sendingOtp} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>
              {sendingOtp ? 'Enviando…' : 'Enviar código'}
            </button>
          ) : (
            <div className="space-y-2">
              <button onClick={verifyCode} disabled={verifying} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>
                {verifying ? 'Verificando…' : 'Ingresar'}
              </button>
              <button
                type="button"
                onClick={() => { setOtpSent(false); setCode(''); setMsg({ text: '', type: '' }); }}
                className={`${btn} border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600`}
              >
                Reenviar código
              </button>
            </div>
          )}

          <p className="text-center text-xs text-gray-500 pt-1">
            ¿No tenés cuenta?{' '}
            <Link to="/signup" className="text-green-400 hover:text-green-300">Registrate</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
