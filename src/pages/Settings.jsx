import { useEffect, useState } from 'react';

const PROVIDERS = [
  { value: 'kapso', label: 'Kapso', desc: 'API oficial de WhatsApp Business' },
  { value: 'waha', label: 'WAHA', desc: 'WhatsApp HTTP API (self-hosted)' },
  { value: 'baileys', label: 'Baileys', desc: 'Librería open-source (no oficial)' },
];

function Section({ title, children }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-5">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function Settings() {
  const [appInfo, setAppInfo] = useState(null);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [provider, setProvider] = useState('kapso');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [delay, setDelay] = useState('2000');
  const [batchSize, setBatchSize] = useState('10');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    window.api?.getAppInfo?.().then(setAppInfo).catch(() => {});
    window.api?.whatsapp?.getStatus?.().then(s => setWaStatus(s?.status || 'disconnected')).catch(() => {});
    window.api?.settings?.getAll?.().then(s => {
      if (!s) return;
      if (s.wa_provider) setProvider(s.wa_provider);
      if (s.wa_api_key) setApiKey(s.wa_api_key);
      if (s.wa_api_url) setApiUrl(s.wa_api_url);
      if (s.campaign_delay) setDelay(String(s.campaign_delay));
      if (s.campaign_batch) setBatchSize(String(s.campaign_batch));
    }).catch(() => {});

    const handler = (e) => { if (e.type === 'status') setWaStatus(e.status); };
    window.api?.onWhatsAppEvent?.(handler);
    return () => window.api?.offWhatsAppEvent?.(handler);
  }, []);

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        window.api?.settings?.set('wa_provider', provider),
        window.api?.settings?.set('wa_api_key', apiKey),
        window.api?.settings?.set('wa_api_url', apiUrl),
        window.api?.settings?.set('campaign_delay', Number(delay)),
        window.api?.settings?.set('campaign_batch', Number(batchSize)),
      ]);
      showMsg('Configuración guardada');
    } catch (err) {
      showMsg('Error al guardar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await window.api?.whatsapp?.connect({ providerName: provider, config: { apiKey, apiUrl } });
      if (res?.ok) showMsg('Conectado a WhatsApp');
      else showMsg(res?.error || 'Error al conectar', 'error');
    } catch (err) {
      showMsg(err.message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await window.api?.whatsapp?.disconnect();
    setWaStatus('disconnected');
  };

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-sm text-gray-400 mt-1">Ajustes de WhatsApp y la aplicación</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.type === 'error' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-green-500/15 text-green-400 border border-green-500/20'}`}>
          {msg.text}
        </div>
      )}

      {/* WhatsApp connection */}
      <Section title="Conexión WhatsApp">
        <Field label="Proveedor">
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button key={p.value} onClick={() => setProvider(p.value)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${provider === p.value ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}
              >
                <div className={`text-sm font-medium ${provider === p.value ? 'text-green-400' : 'text-gray-300'}`}>{p.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="API Key">
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </Field>
        <Field label="API URL (opcional)">
          <input
            type="url"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder="https://tu-instancia.com"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex items-center gap-2 flex-1">
            <span className={`h-2 w-2 rounded-full ${waStatus === 'connected' ? 'bg-green-500' : waStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-sm text-gray-400 capitalize">Estado: {waStatus}</span>
          </div>
          {waStatus === 'connected' ? (
            <button onClick={handleDisconnect} className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm transition-colors">
              Desconectar
            </button>
          ) : (
            <button onClick={handleConnect} disabled={connecting || !apiKey} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
              {connecting ? 'Conectando...' : 'Conectar'}
            </button>
          )}
        </div>
      </Section>

      {/* Campaign settings */}
      <Section title="Configuración de campañas">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Delay entre mensajes (ms)">
            <input
              type="number"
              min="500"
              max="30000"
              value={delay}
              onChange={e => setDelay(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </Field>
          <Field label="Tamaño de lote">
            <input
              type="number"
              min="1"
              max="100"
              value={batchSize}
              onChange={e => setBatchSize(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </Field>
        </div>
      </Section>

      {/* App info */}
      <Section title="Información de la aplicación">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Versión</span><span className="text-gray-200">{appInfo?.appVersion || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Dispositivo</span><span className="text-gray-200">{appInfo?.deviceName || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Sistema</span><span className="text-gray-200">{appInfo?.os || '—'}</span></div>
        </div>
      </Section>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}
