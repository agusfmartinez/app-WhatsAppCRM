import { useEffect, useState, useCallback } from 'react';

const STATUS_COLOR = {
  APPROVED: 'bg-green-500/15 text-green-400',
  PENDING: 'bg-yellow-500/15 text-yellow-400',
  REJECTED: 'bg-red-500/15 text-red-400',
  DISABLED: 'bg-gray-700 text-gray-400',
};

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const LANGUAGES = [
  { code: 'es_AR', label: 'Español (Argentina)' },
  { code: 'es', label: 'Español' },
  { code: 'es_MX', label: 'Español (México)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'pt_BR', label: 'Português (Brasil)' },
];

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500';

function VariableHighlight({ text }) {
  const parts = text.split(/({{[\w]+}})/g);
  return (
    <span>
      {parts.map((p, i) =>
        /^{{[\w]+}}$/.test(p)
          ? <span key={i} className="bg-green-500/20 text-green-400 rounded px-1 font-mono text-xs">{p}</span>
          : p
      )}
    </span>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    language: 'es_AR',
    category: 'MARKETING',
    headerText: '',
    headerExample: '',
    body: '',
    footer: '',
    variables: [],
    buttons: [],
  });
  const headerHasVar = /\{\{\d+\}\}/.test(form.headerText);
  const addButton = () => setForm(f => f.buttons.length >= 3 ? f : ({ ...f, buttons: [...f.buttons, { type: 'QUICK_REPLY', text: '', url: '', phone_number: '', example: '' }] }));
  const updateButton = (i, patch) => setForm(f => { const b = [...f.buttons]; b[i] = { ...b[i], ...patch }; return { ...f, buttons: b }; });
  const removeButton = (i) => setForm(f => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Auto-detect {{N}} variables in body
  const bodyVarCount = (form.body.match(/\{\{\d+\}\}/g) || []).length
    ? Math.max(...(form.body.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/\D/g, ''))))
    : 0;

  const ensureVars = (count) => {
    setForm(f => ({
      ...f,
      variables: Array.from({ length: count }, (_, i) => f.variables[i] || ''),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.body) return setErr('Nombre y cuerpo son requeridos.');
    setSaving(true); setErr('');
    const res = await window.api?.whatsapp?.createTemplate({
      name: form.name,
      language: form.language,
      category: form.category,
      body: form.body,
      variables: form.variables,
      footer: form.footer || undefined,
      headerText: form.headerText || undefined,
      headerExample: form.headerExample || undefined,
      buttons: form.buttons.filter(b => b.text.trim()),
    });
    setSaving(false);
    if (!res?.ok) return setErr(res?.error || 'Error al crear template');
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-white">Nuevo template</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Nombre * <span className="normal-case text-gray-500">(minúsculas, sin espacios)</span></span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }))}
                placeholder="mi_template_ventas" className={`${input} mt-1 font-mono`} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Idioma</span>
              <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className={`${input} mt-1`}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Categoría</span>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={`${input} mt-1`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Header (opcional) <span className="normal-case text-gray-500">— texto, admite una variable {'{{1}}'}</span></span>
            <input value={form.headerText} onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))}
              placeholder="Título del mensaje" className={`${input} mt-1`} />
          </label>
          {headerHasVar && (
            <label className="block">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Ejemplo del header <span className="normal-case text-gray-500">(requerido por Meta)</span></span>
              <input value={form.headerExample} onChange={e => setForm(f => ({ ...f, headerExample: e.target.value }))}
                placeholder="Ej: Oferta de verano" className={`${input} mt-1`} />
            </label>
          )}

          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Cuerpo * <span className="normal-case text-gray-500">— usá {'{{1}}'}, {'{{2}}'} para variables</span></span>
            <textarea
              value={form.body}
              onChange={e => {
                const val = e.target.value;
                setForm(f => ({ ...f, body: val }));
                const count = (val.match(/\{\{(\d+)\}\}/g) || []).length
                  ? Math.max(...(val.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/\D/g, ''))))
                  : 0;
                ensureVars(count);
              }}
              rows={4}
              placeholder={"Hola {{1}}, te escribimos porque te interesó {{2}}."}
              className={`${input} mt-1 resize-none`}
            />
          </label>

          {/* Variable examples — required by Meta for approval */}
          {bodyVarCount > 0 && (
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Ejemplos para revisión de Meta</span>
              <div className="mt-2 space-y-2">
                {Array.from({ length: bodyVarCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono w-8 shrink-0">{'{{' + (i + 1) + '}}'}</span>
                    <input
                      value={form.variables[i] || ''}
                      onChange={e => setForm(f => {
                        const vars = [...f.variables];
                        vars[i] = e.target.value;
                        return { ...f, variables: vars };
                      })}
                      placeholder={`Ejemplo para variable ${i + 1}`}
                      className={`${input} flex-1 text-xs`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Footer (opcional)</span>
            <input value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
              placeholder="No respondas a este mensaje" className={`${input} mt-1`} />
          </label>

          {/* Buttons (optional, max 3) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Botones (opcional) <span className="normal-case text-gray-500">— máx 3</span></span>
              {form.buttons.length < 3 && (
                <button type="button" onClick={addButton} className="text-xs text-green-400 hover:text-green-300">+ Agregar botón</button>
              )}
            </div>
            {form.buttons.map((b, i) => (
              <div key={i} className="rounded-lg border border-gray-700 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={b.type} onChange={e => updateButton(i, { type: e.target.value })} className={`${input} flex-1 text-xs`}>
                    <option value="QUICK_REPLY">Respuesta rápida</option>
                    <option value="URL">Visitar sitio web</option>
                    <option value="PHONE_NUMBER">Llamar</option>
                  </select>
                  <button type="button" onClick={() => removeButton(i)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700" title="Quitar">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <input value={b.text} onChange={e => updateButton(i, { text: e.target.value.slice(0, 25) })}
                  placeholder="Texto del botón (máx 25)" className={`${input} text-xs`} />
                {b.type === 'URL' && (
                  <input value={b.url} onChange={e => updateButton(i, { url: e.target.value })}
                    placeholder="https://ejemplo.com" className={`${input} text-xs font-mono`} />
                )}
                {b.type === 'PHONE_NUMBER' && (
                  <input value={b.phone_number} onChange={e => updateButton(i, { phone_number: e.target.value })}
                    placeholder="+54 9 11 1234 5678" className={`${input} text-xs font-mono`} />
                )}
              </div>
            ))}
          </div>

          {/* Live preview of full template */}
          {(form.body || form.headerText || form.buttons.some(b => b.text.trim())) && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1.5">Vista previa</span>
              <TemplatePreview
                template={{
                  components: [
                    ...(form.headerText ? [{ type: 'HEADER', format: 'TEXT', text: form.headerText }] : []),
                    { type: 'BODY', text: form.body },
                    ...(form.footer ? [{ type: 'FOOTER', text: form.footer }] : []),
                    ...(form.buttons.some(b => b.text.trim())
                      ? [{ type: 'BUTTONS', buttons: form.buttons.filter(b => b.text.trim()).map(b => ({ text: b.text })) }]
                      : []),
                  ],
                }}
                params={form.variables}
                headerParams={[form.headerExample]}
              />
            </div>
          )}

          {err && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5 text-xs text-yellow-400">
            El template quedará en estado <strong>PENDING</strong> hasta que Meta lo apruebe (generalmente 24-48hs).
          </div>
        </form>

        <div className="flex gap-3 px-6 pb-5 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
            {saving ? 'Enviando a Meta…' : 'Crear template'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Replace {{1}}, {{2}}… in text with provided param values (keeps placeholder if empty) */
function fillVars(text, params) {
  if (!text) return '';
  return text.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] || m);
}

/** WhatsApp-style bubble rendering header/body/footer/buttons of a template */
function TemplatePreview({ template, params = [], headerParams }) {
  const comps = template.components || [];
  const header = comps.find(c => c.type === 'HEADER');
  const body = comps.find(c => c.type === 'BODY');
  const footer = comps.find(c => c.type === 'FOOTER');
  const buttons = comps.find(c => c.type === 'BUTTONS')?.buttons || [];

  return (
    <div className="bg-[#0b141a] rounded-lg p-3">
      <div className="bg-[#202c33] rounded-lg rounded-tl-sm px-3 py-2 max-w-[85%] shadow">
        {header?.format === 'TEXT' && header.text && (
          <p className="text-sm font-semibold text-gray-100 mb-1">{fillVars(header.text, headerParams || params)}</p>
        )}
        {body?.text && (
          <p className="text-sm text-gray-100 whitespace-pre-wrap">{fillVars(body.text, params)}</p>
        )}
        {footer?.text && (
          <p className="text-[11px] text-gray-400 mt-1.5">{footer.text}</p>
        )}
      </div>
      {buttons.length > 0 && (
        <div className="mt-1.5 space-y-1 max-w-[85%]">
          {buttons.map((b, i) => (
            <div key={i} className="bg-[#202c33] rounded-lg py-2 text-center text-sm text-[#53bdeb] font-medium">
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestModal({ template, onClose }) {
  const body = template.components?.find(c => c.type === 'BODY');
  const varCount = (body?.text?.match(/\{\{(\d+)\}\}/g) || [])
    .map(m => parseInt(m.replace(/\D/g, ''))).reduce((a, b) => Math.max(a, b), 0);
  const [phone, setPhone] = useState('');
  const [params, setParams] = useState(Array(varCount).fill(''));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits) return setResult({ ok: false, msg: 'Ingresá un teléfono con código de país.' });
    setSending(true); setResult(null);
    const components = params.length
      ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p || ' ' })) }]
      : [];
    const res = await window.api?.whatsapp?.sendTemplate?.(digits, template.name, template.language, components);
    setSending(false);
    setResult(res?.ok ? { ok: true, msg: 'Mensaje de prueba enviado.' } : { ok: false, msg: res?.error || 'Error al enviar' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Probar template</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{template.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Teléfono</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 11 1234 5678" className={`${input} mt-1 font-mono`} />
            <span className="text-[11px] text-gray-500 mt-1 block">Incluí el código de país.</span>
          </label>

          {varCount > 0 && (
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Parámetros</span>
              <div className="mt-2 space-y-2">
                {params.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono w-8 shrink-0">{'{{' + (i + 1) + '}}'}</span>
                    <input value={p} onChange={e => setParams(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                      placeholder={`Valor ${i + 1}`} className={`${input} flex-1 text-xs`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1.5">Preview</span>
            <TemplatePreview template={template} params={params} />
          </div>

          {result && (
            <p className={`text-xs rounded-lg px-3 py-2 ${result.ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>{result.msg}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">Cerrar</button>
          <button onClick={send} disabled={sending} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
            {sending ? 'Enviando…' : 'Enviar prueba'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [businessAccountId, setBusinessAccountId] = useState(null);
  const [testTemplate, setTestTemplate] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback((after = null) => {
    if (after) setLoadingMore(true); else setLoading(true);
    window.api?.whatsapp?.getTemplates?.({ after })
      .then(r => {
        if (r?.ok) {
          setTemplates(prev => after ? [...prev, ...(r.templates || [])] : (r.templates || []));
          setCursor(r.after || null);
          if (r.businessAccountId) setBusinessAccountId(r.businessAccountId);
        } else if (!after) {
          setTemplates([]);
        }
      })
      .catch(() => { if (!after) setTemplates([]); })
      .finally(() => { if (after) setLoadingMore(false); else setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'ALL' ? templates : templates.filter(t => t.status === filter);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-sm text-gray-400 mt-1">{templates.length} templates en Meta</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} disabled={loading} title="Actualizar"
            className="flex items-center gap-2 px-3 py-2 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 disabled:opacity-40 rounded-lg transition-colors">
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualizar
          </button>
          <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-sm font-medium text-white rounded-lg transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo template
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {['ALL', 'APPROVED', 'PENDING', 'REJECTED'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
            {s === 'ALL' ? 'Todos' : s}
            {s !== 'ALL' && <span className="ml-1.5 text-gray-500">({templates.filter(t => t.status === s).length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando…</div>
      ) : !templates.length ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm mb-3">Sin templates. WhatsApp requiere al menos uno aprobado para campañas.</p>
          <button onClick={() => setModal(true)} className="text-green-400 hover:text-green-300 text-sm">Crear el primero →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const body = t.components?.find(c => c.type === 'BODY');
            const vars = (body?.text?.match(/\{\{\d+\}\}/g) || []).length;
            return (
              <div key={t.id ?? t.name} className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-medium text-gray-100">{t.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[t.status] || STATUS_COLOR.DISABLED}`}>{t.status}</span>
                      <span className="text-[11px] text-gray-500">{t.category}</span>
                      <span className="text-[11px] text-gray-500">{t.language}</span>
                      {vars > 0 && <span className="text-[11px] text-green-500">{vars} variable{vars > 1 ? 's' : ''}</span>}
                    </div>
                    {body?.text && (
                      <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">
                        <VariableHighlight text={body.text} />
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Preview / test send */}
                    <button
                      onClick={() => setTestTemplate(t)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-gray-700 transition-colors"
                      title="Vista previa / enviar prueba"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                    {/* Open in Meta WhatsApp Manager */}
                    {businessAccountId && t.id && (
                      <button
                        onClick={() => window.api?.openExternal?.(
                          `https://business.facebook.com/latest/whatsapp_manager/template_details?asset_id=${businessAccountId}&id=${t.id}&tab=template-details`
                        )}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-700 transition-colors"
                        title="Abrir en Meta WhatsApp Manager"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                      </button>
                    )}
                    {/* Delete */}
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${t.name}"? Esta acción no se puede deshacer.`)) return;
                        const res = await window.api?.whatsapp?.deleteTemplate?.(t.name);
                        if (res?.ok) load();
                        else alert(res?.error || 'Error al eliminar');
                      }}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors"
                      title="Eliminar template"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cursor && !loading && (
        <div className="mt-4 text-center">
          <button onClick={() => load(cursor)} disabled={loadingMore}
            className="px-4 py-2 text-sm text-gray-300 border border-gray-700 rounded-lg hover:border-gray-600 disabled:opacity-40 transition-colors">
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}

      {modal && <CreateModal onClose={() => setModal(false)} onCreated={() => load()} />}
      {testTemplate && <TestModal template={testTemplate} onClose={() => setTestTemplate(null)} />}
    </div>
  );
}
