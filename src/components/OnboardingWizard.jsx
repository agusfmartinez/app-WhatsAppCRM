import { useState, useRef, useEffect, useCallback } from 'react';

const KAPSO_SIGNUP = 'https://app.kapso.ai/users/sign_up';
const KAPSO_APP = 'https://app.kapso.ai';
const POLL_MS = 5000;
const POLL_MAX = 120; // stop auto-polling after ~10 min

const STEPS = ['Crear cuenta', 'API key', 'Conectar número'];

// Brand theme for Kapso's hosted setup page (green, dark)
const THEME = {
  primary_color: '#16a34a',
  primary_foreground_color: '#ffffff',
  background_color: '#0a0a0a',
  text_color: '#f3f4f6',
  border_color: '#374151',
};

function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
            i < step ? 'bg-green-600 text-white' : i === step ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500' : 'bg-gray-800 text-gray-500'
          }`}>
            {i < step ? '✓' : i + 1}
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 w-10 mx-1 ${i < step ? 'bg-green-600' : 'bg-gray-800'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingWizard({ onDone, onSkip }) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);        // generic in-flight (validate / link / connect)
  const [error, setError] = useState('');

  const [setupUrl, setSetupUrl] = useState('');
  const [polling, setPolling] = useState(false);
  const [number, setNumber] = useState(null);      // detected { phone_number_id, business_account_id, label, status }
  const pollRef = useRef(null);
  const attemptsRef = useRef(0);

  const open = (url) => window.api?.openExternal?.(url);

  // Map a detected Kapso number to our shape
  const pickNumber = (nums) => {
    if (!nums?.length) return null;
    const connected = nums.find(n => n.status === 'CONNECTED') || nums[0];
    return {
      phone_number_id: connected.phone_number_id,
      business_account_id: connected.business_account_id,
      label: connected.display_phone_number || connected.phone_number_id,
      status: connected.status,
    };
  };

  // Step 1 → validate key. If a number is already connected, skip ahead.
  const validateKey = async () => {
    setError(''); setBusy(true);
    const res = await window.api?.whatsapp?.detectNumbers?.(apiKey.trim());
    setBusy(false);
    if (!res?.ok) return setError(res?.error || 'API key inválida. Revisá que la copiaste completa.');
    const picked = pickNumber(res.phoneNumbers);
    if (picked && picked.status === 'CONNECTED') {
      // Already has a connected number — no setup link needed
      setNumber(picked);
    }
    setStep(2);
  };

  // Step 2 → generate hosted setup link and open it, then poll for the number
  const startSetup = async () => {
    setError(''); setBusy(true);
    const res = await window.api?.whatsapp?.createSetupLink?.(apiKey.trim(), { language: 'es', theme: THEME });
    setBusy(false);
    if (!res?.ok) return setError(res?.error || 'No se pudo generar el link de conexión.');
    setSetupUrl(res.url);
    open(res.url);
    setPolling(true);
  };

  // Poll detectNumbers until a number appears (or cap reached)
  const poll = useCallback(async () => {
    attemptsRef.current += 1;
    if (attemptsRef.current > POLL_MAX) { setPolling(false); return; }
    const res = await window.api?.whatsapp?.detectNumbers?.(apiKey.trim());
    if (res?.ok) {
      const picked = pickNumber(res.phoneNumbers);
      if (picked) { setNumber(picked); setPolling(false); }
    }
  }, [apiKey]);

  useEffect(() => {
    if (!polling) return;
    attemptsRef.current = 0;
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [polling, poll]);

  // Final connect + persist
  const finish = async () => {
    if (!number) return;
    setError(''); setBusy(true);
    await Promise.all([
      window.api?.settings?.set('wa_provider', 'kapso'),
      window.api?.settings?.set('wa_api_key', apiKey.trim()),
      window.api?.settings?.set('wa_api_url', number.phone_number_id),
      window.api?.settings?.set('wa_business_account_id', number.business_account_id),
    ]);
    const res = await window.api?.whatsapp?.connect({
      providerName: 'kapso',
      config: { apiKey: apiKey.trim(), phoneNumberId: number.phone_number_id, businessAccountId: number.business_account_id },
    });
    setBusy(false);
    if (res?.ok) onDone?.();
    else setError(res?.error || 'Error al conectar. Reintentá.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-gray-100 flex items-center justify-center p-6 overflow-auto">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 rounded-xl bg-green-500 items-center justify-center mb-3">
            <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L.057 23.177a.75.75 0 00.92.92l5.57-1.338A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.18-1.43l-.37-.22-3.834.922.937-3.724-.243-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          </div>
          <h1 className="text-xl font-bold text-white">Conectá tu WhatsApp</h1>
          <p className="text-sm text-gray-400 mt-1">Configurá tu cuenta de Kapso en 3 pasos para empezar.</p>
        </div>

        <StepDots step={step} />

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {/* Step 1 — Create account */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-white">1. Creá tu cuenta de Kapso</h2>
              <p className="text-sm text-gray-400">
                Kapso es el proveedor que conecta tu número de WhatsApp. El plan gratuito incluye 1 número y 2.000 mensajes por mes.
              </p>
              <button onClick={() => open(KAPSO_SIGNUP)} className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium text-white transition-colors">
                Registrarme gratis en Kapso
              </button>
              <p className="text-xs text-gray-500 text-center">Se abre en tu navegador. Cuando tengas la cuenta, volvé acá.</p>
            </div>
          )}

          {/* Step 2 — API key */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-white">2. Pegá tu API key de Kapso</h2>
              <div className="rounded-lg bg-gray-800 p-3 text-xs text-gray-400 space-y-1">
                <p>1. Abrí Kapso y entrá a tu proyecto.</p>
                <p>2. Andá a la pestaña <span className="text-gray-200">API & Webhooks</span>.</p>
                <p>3. Creá una API key (o copiá una existente) y pegala acá abajo.</p>
              </div>
              <button onClick={() => open(KAPSO_APP)} className="w-full py-2.5 rounded-lg border border-gray-700 text-sm text-gray-200 hover:border-gray-600 transition-colors">
                Abrir Kapso → API & Webhooks
              </button>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setError(''); }}
                placeholder="Pegá tu API key"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          )}

          {/* Step 3 — Connect number via setup link + poll */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-white">3. Conectá tu número de WhatsApp</h2>

              {number ? (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-center">
                  <p className="text-sm text-green-400 font-medium">✓ Número detectado</p>
                  <p className="text-base text-white font-mono mt-1">{number.label}</p>
                  {number.status && <p className="text-[11px] text-gray-400 mt-0.5">{number.status}</p>}
                </div>
              ) : setupUrl ? (
                <div className="rounded-lg bg-gray-800 p-4 text-center space-y-2">
                  <div className="inline-flex items-center gap-2 text-sm text-gray-300">
                    {polling && <span className="h-3 w-3 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />}
                    {polling ? 'Esperando que conectes el número…' : 'Cuando termines, verificá la conexión.'}
                  </div>
                  <p className="text-xs text-gray-500">Completá el asistente de Meta en la página que se abrió{polling ? '. Detectamos automáticamente cuando esté listo.' : '.'}</p>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button onClick={() => open(setupUrl)} className="text-xs text-green-400 hover:text-green-300">Reabrir página</button>
                    <button onClick={() => { attemptsRef.current = 0; setPolling(false); poll(); setPolling(true); }} className="text-xs text-gray-300 hover:text-white">Verificar ahora</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    Generamos una página segura para conectar tu número con Meta (login de Facebook + verificación). Se abre en tu navegador.
                  </p>
                  <button onClick={startSetup} disabled={busy} className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
                    {busy ? 'Generando…' : 'Generar link de conexión'}
                  </button>
                </>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          {/* Nav */}
          <div className="flex items-center gap-3 mt-6">
            {step > 0 ? (
              <button onClick={() => { setError(''); setPolling(false); setStep(s => s - 1); }} className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
                ← Atrás
              </button>
            ) : <div />}
            <div className="flex-1" />
            {step === 0 && (
              <button onClick={() => setStep(1)} className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium text-white transition-colors">
                Ya tengo cuenta →
              </button>
            )}
            {step === 1 && (
              <button onClick={validateKey} disabled={!apiKey.trim() || busy} className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
                {busy ? 'Validando…' : 'Continuar →'}
              </button>
            )}
            {step === 2 && number && (
              <button onClick={finish} disabled={busy} className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
                {busy ? 'Conectando…' : 'Conectar y finalizar'}
              </button>
            )}
          </div>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <button onClick={onSkip} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Configurar más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
