import { useEffect, useState } from 'react';

const STATUS_LABELS = { draft: 'Borrador', sending: 'Enviando...', sent: 'Enviada' };
const STATUS_COLORS = {
  draft: 'bg-gray-700 text-gray-300',
  sending: 'bg-yellow-500/15 text-yellow-400',
  sent: 'bg-green-500/15 text-green-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────
function CampaignWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ name: '', message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    window.api?.contacts?.list({}).then(c => setContacts(c || [])).catch(() => {});
  }, []);

  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map(c => c.id)));
  };

  const submit = async () => {
    setSending(true);
    try {
      const res = await window.api?.campaigns?.create({
        name: form.name,
        messageTemplate: form.message,
        contactIds: [...selected],
      });
      if (res?.ok) { onCreated(); onClose(); }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">Nueva campaña — Paso {step} de 3</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${s <= step ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}>{s}</div>
                {s < 3 && <div className={`h-px w-8 ${s < step ? 'bg-green-600' : 'bg-gray-700'}`} />}
              </div>
            ))}
            <span className="ml-2 text-xs text-gray-400">{['Contactos', 'Mensaje', 'Preview'][step - 1]}</span>
          </div>

          {step === 1 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-300">{selected.size} / {contacts.length} seleccionados</span>
                <button onClick={toggleAll} className="text-xs text-green-400 hover:text-green-300">
                  {selected.size === contacts.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {contacts.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => setSelected(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                      className="accent-green-500"
                    />
                    <div>
                      <div className="text-sm text-gray-200">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.phone}</div>
                    </div>
                  </label>
                ))}
                {contacts.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Sin contactos disponibles</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Nombre de la campaña *</span>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Mensaje *</span>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  rows={5}
                  placeholder="Escribí el mensaje que se enviará a los contactos..."
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Campaña</span><span className="text-gray-100 font-medium">{form.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Destinatarios</span><span className="text-gray-100 font-medium">{selected.size} contactos</span></div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Preview del mensaje</div>
                <div className="bg-green-600 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm text-white max-w-xs">
                  {form.message || <span className="text-green-300 italic">Sin mensaje</span>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 ? selected.size === 0 : !form.name || !form.message}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={sending}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              {sending ? 'Creando...' : 'Crear campaña'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [sending, setSending] = useState(null);

  const load = () => {
    setLoading(true);
    window.api?.campaigns?.list().then(c => { setCampaigns(c || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSend = async (id) => {
    setSending(id);
    await window.api?.campaigns?.send(id);
    setSending(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar campaña?')) return;
    await window.api?.campaigns?.delete(id);
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campañas</h1>
          <p className="text-sm text-gray-400 mt-1">{campaigns.length} campañas</p>
        </div>
        <button onClick={() => setWizard(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-sm font-medium text-white rounded-lg transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva campaña
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin campañas. Creá tu primera difusión.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-100 truncate">{c.name}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>{c.total_contacts} contactos</span>
                  {c.sent_count > 0 && <span className="text-green-500">{c.sent_count} enviados</span>}
                  {c.error_count > 0 && <span className="text-red-400">{c.error_count} errores</span>}
                  <span>{c.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status === 'draft' && (
                  <button
                    onClick={() => handleSend(c.id)}
                    disabled={sending === c.id}
                    className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
                  >
                    {sending === c.id ? 'Enviando...' : 'Enviar'}
                  </button>
                )}
                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizard && <CampaignWizard onClose={() => setWizard(false)} onCreated={load} />}
    </div>
  );
}
