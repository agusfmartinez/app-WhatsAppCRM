import { useEffect, useState } from 'react';
import OnboardingWizard from '../components/OnboardingWizard.jsx';

const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500';
// Same box, but signals read-only when disabled (no layout shift on edit toggle)
const fieldCls = `${inputCls} disabled:bg-gray-900/50 disabled:border-gray-700 disabled:text-gray-300 disabled:cursor-default`;

// Meta WhatsApp business verticals
const VERTICALS = [
  { value: 'OTHER', label: 'Otro' },
  { value: 'AUTO', label: 'Automotor' },
  { value: 'BEAUTY', label: 'Belleza / Spa' },
  { value: 'APPAREL', label: 'Indumentaria' },
  { value: 'EDU', label: 'Educación' },
  { value: 'ENTERTAIN', label: 'Entretenimiento' },
  { value: 'EVENT_PLAN', label: 'Eventos' },
  { value: 'FINANCE', label: 'Finanzas' },
  { value: 'GROCERY', label: 'Almacén / Supermercado' },
  { value: 'HOTEL', label: 'Hotelería' },
  { value: 'HEALTH', label: 'Salud' },
  { value: 'NONPROFIT', label: 'ONG' },
  { value: 'PROF_SERVICES', label: 'Servicios profesionales' },
  { value: 'RETAIL', label: 'Comercio / Retail' },
  { value: 'TRAVEL', label: 'Viajes' },
  { value: 'RESTAURANT', label: 'Restaurante' },
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

function ReadOnly({ label, value, mono }) {
  return (
    <div>
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <div className={`mt-1 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 truncate ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function Settings() {
  const [appInfo, setAppInfo] = useState(null);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [apiUrl, setApiUrl] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [delay, setDelay] = useState('2000');
  const [batchSize, setBatchSize] = useState('10');
  const [saving, setSaving] = useState(false);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [phoneDetails, setPhoneDetails] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [profileForm, setProfileForm] = useState({ about: '', description: '', email: '', address: '', vertical: '', websites: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [submittingName, setSubmittingName] = useState(false);
  const [displayRequests, setDisplayRequests] = useState([]);
  const [notifyMsgs, setNotifyMsgs] = useState(false);

  useEffect(() => {
    window.api?.getAppInfo?.().then(setAppInfo).catch(() => {});
    window.api?.whatsapp?.getStatus?.().then(s => {
      const st = s?.status || 'disconnected';
      setWaStatus(st);
      if (st === 'connected') {
        loadProfile();
        loadDisplayRequests();
        window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => { if (r?.ok !== false) { setPhoneDetails(r); const n = r?.verified_name || r?.display_phone_number; if (n) try { localStorage.setItem('wa_number_name', n); } catch {} } }).catch(() => {});
      }
    }).catch(() => {});
    window.api?.settings?.getAll?.().then(s => {
      if (!s) return;
      if (s.wa_api_url) setApiUrl(s.wa_api_url);
      if (s.wa_business_account_id) setBusinessAccountId(s.wa_business_account_id);
      if (s.campaign_delay) setDelay(String(s.campaign_delay));
      if (s.campaign_batch) setBatchSize(String(s.campaign_batch));
      setNotifyMsgs(s.notify_new_messages === true);
    }).catch(() => {});

    const handler = (e) => {
      if (e.type === 'status') {
        setWaStatus(e.status);
        if (e.status === 'connected') {
          loadProfile();
          loadDisplayRequests();
          window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => { if (r?.ok !== false) { setPhoneDetails(r); const n = r?.verified_name || r?.display_phone_number; if (n) try { localStorage.setItem('wa_number_name', n); } catch {} } }).catch(() => {});
        }
      }
    };
    window.api?.onWhatsAppEvent?.(handler);
    return () => window.api?.offWhatsAppEvent?.(handler);
  }, []);

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  // Meta returns the business profile under data[] — flatten and hydrate the form
  const loadProfile = () => {
    window.api?.whatsapp?.getBusinessProfile?.().then(r => {
      if (r?.ok === false) return;
      const p = r?.data?.[0] ?? r?.data ?? r ?? {};
      setBusinessProfile(p);
      setProfileForm({
        about: p.about || '',
        description: p.description || '',
        email: p.email || '',
        address: p.address || '',
        vertical: p.vertical || '',
        websites: Array.isArray(p.websites) ? p.websites.join('\n') : (p.websites || ''),
      });
    }).catch(() => {});
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
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

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const websites = profileForm.websites.split(/[\n,]/).map(w => w.trim()).filter(Boolean);
      const body = {
        messaging_product: 'whatsapp',
        about: profileForm.about || undefined,
        description: profileForm.description || undefined,
        email: profileForm.email || undefined,
        address: profileForm.address || undefined,
        vertical: profileForm.vertical || undefined,
        ...(websites.length ? { websites } : {}),
      };
      const res = await window.api?.whatsapp?.updateBusinessProfile?.(body);
      if (res?.ok !== false) { showMsg('Perfil actualizado'); loadProfile(); }
      else showMsg(res?.error || 'Error al actualizar el perfil', 'error');
    } catch (err) {
      showMsg('Error: ' + err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const loadDisplayRequests = () => {
    window.api?.whatsapp?.getDisplayNameRequests?.().then(r => {
      if (r?.ok) setDisplayRequests(r.requests || []);
    }).catch(() => {});
  };

  const submitDisplayName = async () => {
    if (!displayName.trim()) return;
    setSubmittingName(true);
    const res = await window.api?.whatsapp?.submitDisplayName?.(displayName.trim());
    setSubmittingName(false);
    if (res?.ok) {
      showMsg('Nombre enviado a revisión de Meta');
      setDisplayName('');
      loadDisplayRequests();
    } else {
      showMsg(res?.error || 'Error al enviar el nombre', 'error');
    }
  };

  const handleDisconnect = async () => {
    await window.api?.whatsapp?.disconnect();
    setWaStatus('disconnected');
    try { localStorage.removeItem('wa_number_name'); } catch {}
  };

  const toggleNotify = (val) => {
    setNotifyMsgs(val);
    window.api?.settings?.set('notify_new_messages', val);
    window.api?.setNotify?.(val);
  };

  return (
    // <div className="p-8 max-w-2xl space-y-6">
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-sm text-gray-400 mt-1">Ajustes de WhatsApp y la aplicación</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${msg.type === 'error' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-green-500/15 text-green-400 border border-green-500/20'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp config */}
        <Section title="Configurar WhatsApp">
          {waStatus !== 'connected' ? (
            <div className="flex items-center justify-between rounded-lg bg-green-500/5 border border-green-500/15 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-gray-100">Conectá tu número de WhatsApp</p>
                <p className="text-xs text-gray-400 mt-0.5">Te guiamos paso a paso.</p>
              </div>
              <button onClick={() => setShowWizard(true)} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-xs font-medium text-white shrink-0 transition-colors">
                Asistente de conexión
              </button>
            </div>
          ) : (
            <>
              {/* Status + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-300">Conectado</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowWizard(true)} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300 hover:text-white hover:border-gray-600 transition-colors">Reconectar</button>
                  <button onClick={handleDisconnect} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs transition-colors">Desconectar</button>
                </div>
              </div>

              {/* Read-only identifiers */}
              <div className="grid grid-cols-2 gap-3">
                <ReadOnly label="Número" value={phoneDetails?.display_phone_number} mono />
                <ReadOnly label="Nombre verificado" value={phoneDetails?.verified_name} />
                <ReadOnly label="Phone Number ID" value={apiUrl} mono />
                <ReadOnly label="Business Account ID" value={businessAccountId} mono />
              </div>

              {/* New-message notifications (opt-in) */}
              <div className="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3">
                <div>
                  <p className="text-sm text-gray-200">Notificar mensajes nuevos</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Consulta mensajes en segundo plano cada 30s. Desactivado = sin llamadas cuando no estás en Conversaciones.</p>
                </div>
                <button onClick={() => toggleNotify(!notifyMsgs)} role="switch" aria-checked={notifyMsgs}
                  className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${notifyMsgs ? 'bg-green-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${notifyMsgs ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Editar Display name (Meta review) */}
              <div className="border-t border-gray-700 pt-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Editar Nombre verificado</h3>
                <p className="text-xs text-gray-500">Es el nombre que ven tus clientes. Sujeto a revisión de Meta (24-48hs).</p>
                {displayRequests[0] && displayRequests[0].status !== 'applied' && (
                  <p className="text-[11px] text-yellow-400">
                    Solicitud "{displayRequests[0].requested_display_name}" — estado: {displayRequests[0].status}
                    {displayRequests[0].meta_error_message ? ` (${displayRequests[0].meta_error_message})` : ''}
                  </p>
                )}
                <div className="flex gap-2">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 256))}
                    placeholder='Nuevo nombre' className={inputCls} />
                  <button onClick={submitDisplayName} disabled={!displayName.trim() || submittingName}
                    className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs text-gray-200 shrink-0 transition-colors">
                    {submittingName ? '...' : 'Enviar a revisión'}
                  </button>
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Business profile */}
        <Section title="Perfil de WhatsApp Business">
          {waStatus !== 'connected' ? (
            <></>
          ) : (
            <>
              {/* Business profile — read-only with edit toggle */}
              
              <div className="flex items-center justify-between">
                {/* <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Perfil del negocio</h3> */}
                <p className="text-xs text-gray-500">Administra el perfil público que se muestra a los usuarios en WhatsApp.</p>
                {!editingProfile && (
                  <button onClick={() => setEditingProfile(true)} className="text-xs text-green-400 hover:text-green-300">Editar</button>
                )}
              </div>
                

              <div className="grid grid-cols-2 gap-3">
                <Field label="Descripción corta">
                  <input disabled={!editingProfile} value={profileForm.about} onChange={e => setProfileForm(f => ({ ...f, about: e.target.value }))}
                    placeholder="Ej: Atención al cliente" className={fieldCls} />
                </Field>
                <Field label="Email">
                  <input disabled={!editingProfile} value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="negocio@ejemplo.com" className={fieldCls} />
                </Field>
                <Field label="Dirección">
                  <input disabled={!editingProfile} value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Dirección del negocio" className={fieldCls} />
                </Field>
                <Field label="Rubro">
                  <select disabled={!editingProfile} value={profileForm.vertical} onChange={e => setProfileForm(f => ({ ...f, vertical: e.target.value }))} className={fieldCls}>
                    <option value="">—</option>
                    {VERTICALS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </Field>
                <div className="col-span-2">
                  <Field label="Descripción">
                    <textarea disabled={!editingProfile} value={profileForm.description} onChange={e => setProfileForm(f => ({ ...f, description: e.target.value }))}
                      rows={2} placeholder="Describí tu negocio" className={`${fieldCls} resize-none`} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Sitios web">
                    <textarea disabled={!editingProfile} value={profileForm.websites} onChange={e => setProfileForm(f => ({ ...f, websites: e.target.value }))}
                      rows={2} placeholder="Un sitio por línea" className={`${fieldCls} resize-none font-mono text-xs`} />
                  </Field>
                </div>
              </div>

              {editingProfile && (
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setEditingProfile(false); loadProfile(); }}
                    className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={async () => { await saveProfile(); setEditingProfile(false); }} disabled={savingProfile}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
                    {savingProfile ? 'Guardando…' : 'Guardar perfil'}
                  </button>
                </div>
              )}
            </>
          )}
        </Section>

        {/* Campaign settings */}
        <Section title="Configuración de campañas">
          <div className="flex items-center justify-end -mt-2">
            {!editingCampaign && (
              <button onClick={() => setEditingCampaign(true)} className="text-xs text-green-400 hover:text-green-300">Editar</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Delay entre mensajes (ms)">
              <input type="number" min="500" max="30000" disabled={!editingCampaign} value={delay} onChange={e => setDelay(e.target.value)} className={fieldCls} />
            </Field>
            <Field label="Tamaño de lote">
              <input type="number" min="1" max="100" disabled={!editingCampaign} value={batchSize} onChange={e => setBatchSize(e.target.value)} className={fieldCls} />
            </Field>
          </div>
          {editingCampaign && (
            <div className="flex justify-end gap-2">
              <button onClick={() => {
                setEditingCampaign(false);
                window.api?.settings?.getAll?.().then(s => {
                  if (s?.campaign_delay) setDelay(String(s.campaign_delay));
                  if (s?.campaign_batch) setBatchSize(String(s.campaign_batch));
                }).catch(() => {});
              }} className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
                Cancelar
              </button>
              <button onClick={async () => { await saveSettings(); setEditingCampaign(false); }} disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
        </Section>

        {/* App info */}
        <Section title="Información de la aplicación">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Versión</span><span className="text-gray-200">{appInfo?.appVersion || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Dispositivo</span><span className="text-gray-200">{appInfo?.deviceName || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Sistema</span><span className="text-gray-200">{appInfo?.os || '—'}</span></div>
          </div>
        </Section>

      </div>

      {showWizard && (
        <OnboardingWizard
          onDone={() => {
            setShowWizard(false);
            setWaStatus('connected');
            window.api?.settings?.getAll?.().then(s => {
              if (s?.wa_api_url) setApiUrl(s.wa_api_url);
              if (s?.wa_business_account_id) setBusinessAccountId(s.wa_business_account_id);
            }).catch(() => {});
            loadProfile();
            window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => { if (r?.ok !== false) { setPhoneDetails(r); const n = r?.verified_name || r?.display_phone_number; if (n) try { localStorage.setItem('wa_number_name', n); } catch {} } }).catch(() => {});
          }}
          onSkip={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
