import { useEffect, useState } from 'react';

const PROVIDERS = [
  { value: 'kapso', label: 'Kapso', desc: 'API oficial de WhatsApp Business' },
  { value: 'waha', label: 'WAHA', desc: 'WhatsApp HTTP API (self-hosted)' },
  { value: 'baileys', label: 'Baileys', desc: 'Librería open-source (no oficial)' },
];

const PROVIDER_FIELDS = {
  kapso:   { apiKeyLabel: 'API Key (X-API-Key)', apiUrlLabel: 'Phone Number ID', apiUrlPlaceholder: '12013619638', showBusinessId: true },
  waha:    { apiKeyLabel: 'API Key', apiUrlLabel: 'URL del servidor WAHA', apiUrlPlaceholder: 'http://localhost:3000', showBusinessId: false },
  baileys: { apiKeyLabel: '—', apiUrlLabel: '—', apiUrlPlaceholder: '', showBusinessId: false },
};

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
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [delay, setDelay] = useState('2000');
  const [batchSize, setBatchSize] = useState('10');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedNumbers, setDetectedNumbers] = useState([]);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [phoneDetails, setPhoneDetails] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    window.api?.getAppInfo?.().then(setAppInfo).catch(() => {});
    window.api?.whatsapp?.getStatus?.().then(s => setWaStatus(s?.status || 'disconnected')).catch(() => {});
    window.api?.settings?.getAll?.().then(s => {
      if (!s) return;
      if (s.wa_provider) setProvider(s.wa_provider);
      if (s.wa_api_key) setApiKey(s.wa_api_key);
      if (s.wa_api_url) setApiUrl(s.wa_api_url);
      if (s.wa_business_account_id) setBusinessAccountId(s.wa_business_account_id);
      if (s.campaign_delay) setDelay(String(s.campaign_delay));
      if (s.campaign_batch) setBatchSize(String(s.campaign_batch));
    }).catch(() => {});

    const handler = (e) => {
      if (e.type === 'status') {
        setWaStatus(e.status);
        if (e.status === 'connected') {
          window.api?.whatsapp?.getBusinessProfile?.().then(r => { if (r?.ok) setBusinessProfile(r.data ?? r); }).catch(() => {});
          window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => { if (r?.ok !== false) setPhoneDetails(r); }).catch(() => {});
        }
      }
    };
    window.api?.onWhatsAppEvent?.(handler);
    // Load profile if already connected
    if (waStatus === 'connected') {
      window.api?.whatsapp?.getBusinessProfile?.().then(r => { if (r?.ok) setBusinessProfile(r.data ?? r); }).catch(() => {});
      window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => { if (r?.ok !== false) setPhoneDetails(r); }).catch(() => {});
    }
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
        window.api?.settings?.set('wa_business_account_id', businessAccountId),
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
      // Map fields to provider-specific config
      const config = provider === 'kapso'
        ? { apiKey, phoneNumberId: apiUrl, businessAccountId }
        : { apiKey, apiUrl };
      const res = await window.api?.whatsapp?.connect({ providerName: provider, config });
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
        {PROVIDER_FIELDS[provider]?.apiKeyLabel !== '—' && (
          <Field label={PROVIDER_FIELDS[provider]?.apiKeyLabel ?? 'API Key'}>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {provider === 'kapso' && (
                <button
                  type="button"
                  disabled={!apiKey || detecting}
                  onClick={async () => {
                    setDetecting(true);
                    const res = await window.api?.whatsapp?.detectNumbers?.(apiKey);
                    setDetecting(false);
                    if (!res?.ok) return showMsg(res?.error || 'Error detectando números', 'error');
                    const nums = res.phoneNumbers || [];
                    setDetectedNumbers(nums);
                    if (nums.length === 1) {
                      setApiUrl(nums[0].phone_number_id);
                      setBusinessAccountId(nums[0].business_account_id);
                      showMsg(`Detectado: ${nums[0].display_phone_number} (${nums[0].verified_name})`);
                    } else if (nums.length === 0) {
                      showMsg('Sin números en este proyecto', 'error');
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:opacity-40 text-xs text-gray-200 shrink-0 transition-colors"
                >
                  {detecting ? '...' : 'Detectar'}
                </button>
              )}
            </div>
            {/* Multiple numbers selector */}
            {detectedNumbers.length > 1 && (
              <div className="mt-2 space-y-1">
                <span className="text-[11px] text-gray-400">Seleccioná un número:</span>
                {detectedNumbers.map(n => (
                  <button
                    key={n.phone_number_id}
                    type="button"
                    onClick={() => {
                      setApiUrl(n.phone_number_id);
                      setBusinessAccountId(n.business_account_id);
                      setDetectedNumbers([]);
                      showMsg(`Seleccionado: ${n.display_phone_number}`);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-gray-100 transition-colors"
                  >
                    <span className="font-medium">{n.display_phone_number}</span>
                    <span className="text-gray-400 ml-2 text-xs">{n.verified_name}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        {PROVIDER_FIELDS[provider]?.apiUrlLabel !== '—' && (
          <Field label={PROVIDER_FIELDS[provider]?.apiUrlLabel ?? 'URL / ID'}>
            <input
              type="text"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder={PROVIDER_FIELDS[provider]?.apiUrlPlaceholder ?? ''}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </Field>
        )}
        {PROVIDER_FIELDS[provider]?.showBusinessId && (
          <Field label="Business Account ID (WABA ID)">
            <input
              type="text"
              value={businessAccountId}
              onChange={e => setBusinessAccountId(e.target.value)}
              placeholder="2750692328664321"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <span className="text-[11px] text-gray-500 mt-1 block">Necesario para listar templates. Está en el panel de Kapso junto a tu Phone Number ID.</span>
          </Field>
        )}

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

      {/* WhatsApp Business Profile */}
      {waStatus === 'connected' && (
        <Section title="Perfil de WhatsApp Business">
          {phoneDetails && (
            <div className="space-y-2 text-sm border-b border-gray-700 pb-4 mb-4">
              <div className="flex justify-between"><span className="text-gray-400">Número</span><span className="text-gray-200 font-mono">{phoneDetails.display_phone_number || phoneDetails.verified_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Calidad</span>
                <span className={`font-medium ${phoneDetails.quality_rating === 'GREEN' ? 'text-green-400' : phoneDetails.quality_rating === 'YELLOW' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {phoneDetails.quality_rating || '—'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-gray-400">Estado verificación</span><span className="text-gray-200">{phoneDetails.code_verification_status || '—'}</span></div>
            </div>
          )}
          {businessProfile && (
            <div className="space-y-3">
              {[['Descripción', 'about'], ['Dirección', 'address'], ['Email', 'email'], ['Sitio web', 'websites']].map(([label, key]) => {
                const val = key === 'websites' ? businessProfile.websites?.[0] : businessProfile[key];
                return val ? (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className="text-gray-200 text-right max-w-xs truncate">{val}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
          {!businessProfile && !phoneDetails && (
            <p className="text-xs text-gray-500">Conectate a WhatsApp para ver el perfil del negocio.</p>
          )}
        </Section>
      )}

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
