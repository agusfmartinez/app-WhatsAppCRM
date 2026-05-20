import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean) return setMsg('Ingresá tu email.');
    setLoading(true); setMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setLoading(false);
    if (error) return setMsg(error.message);
    sessionStorage.setItem('pendingEmail', clean);
    sessionStorage.setItem('otpSent', '1');
    navigate('/pending', { state: { email: clean, otpSent: true } });
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-12 w-12 rounded-xl bg-green-600 flex items-center justify-center">
            <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L.057 23.177a.75.75 0 00.92.92l5.57-1.338A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.18-1.43l-.37-.22-3.834.922.937-3.724-.243-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">WA CRM Desktop</h1>
            <p className="text-sm text-gray-500 mt-0.5">Crear cuenta</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Email</label>
            <input
              type="email"
              placeholder="tu@email.com"
              className={`${input} mt-1`}
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendCode()}
            />
          </div>

          {msg && <p className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400">{msg}</p>}

          <button
            disabled={loading}
            onClick={sendCode}
            className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Enviar código de verificación'}
          </button>

          <p className="text-center text-xs text-gray-500 pt-1">
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" className="text-green-400 hover:text-green-300">Ingresar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
