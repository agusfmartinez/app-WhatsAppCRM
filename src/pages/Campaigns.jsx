import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = { draft: 'Borrador', scheduled: 'Programada', sending: 'Enviando…', completed: 'Completada', failed: 'Fallida' };
const STATUS_COLORS = {
  draft: 'bg-gray-700 text-gray-300',
  scheduled: 'bg-blue-500/15 text-blue-400',
  sending: 'bg-yellow-500/15 text-yellow-400',
  completed: 'bg-green-500/15 text-green-400',
  failed: 'bg-red-500/15 text-red-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function bodyText(tpl) {
  return tpl?.components?.find(c => c.type === 'BODY')?.text || '';
}
// Replace {{1}}, {{2}}… with values[i] (keeps the placeholder if no value)
function renderBody(text, values) {
  return String(text || '').replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] || m);
}
function bodyVarCount(tpl) {
  const matches = bodyText(tpl).match(/\{\{(\d+)\}\}/g) || [];
  return matches.length ? Math.max(...matches.map(m => parseInt(m.replace(/\D/g, '')))) : 0;
}

// Parse a CSV string → { headers, recipients:[{ phone, name, params:[] }] }.
// First/`phone_number` column = phone; `name`/`nombre` = contact name; rest = body params in order.
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
  if (!lines.length) return { headers: [], recipients: [], error: 'Archivo vacío' };
  const sep = [',', ';', '\t', '|'].map(s => ({ s, n: lines[0].split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const headers = lines[0].split(sep).map(h => h.trim());
  const phoneCol = headers.find(h => /phone_number|^phone$|tel[eé]fono|^tel$/i.test(h)) || headers[0];
  const nameCol = headers.find(h => /^name$|^nombre$/i.test(h));
  const paramCols = headers.filter(h => h !== phoneCol && h !== nameCol && !/header_url|header_filename/i.test(h));
  const recipients = lines.slice(1).map(l => {
    const cells = l.split(sep).map(c => c.trim());
    const row = {}; headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return { phone: row[phoneCol], name: nameCol ? row[nameCol] : '', params: paramCols.map(c => row[c]) };
  }).filter(r => String(r.phone || '').replace(/[^0-9]/g, ''));
  return { headers, paramCols, recipients, error: recipients.length ? '' : 'No se encontraron filas con teléfono válido' };
}

// ── Wizard ────────────────────────────────────────────────────────────────────
function CampaignWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ name: '', templateId: '', templateName: '', templateLanguage: 'es_AR' });
  const [contactParams, setContactParams] = useState({}); // { [contactId]: [v1, v2, …] }
  const [paramMode, setParamMode] = useState('global'); // 'global' | 'per'
  const [globalParams, setGlobalParams] = useState([]); // [v1, v2, …] applied to all
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState('contacts'); // 'contacts' | 'csv'
  const [csv, setCsv] = useState({ recipients: [], paramCols: [], error: '', fileName: '' });

  useEffect(() => {
    window.api?.contacts?.list({}).then(c => setContacts(c || [])).catch(() => {});
    setLoadingTemplates(true);
    window.api?.whatsapp?.getTemplates?.()
      .then(r => { if (r?.ok) setTemplates((r.templates || []).filter(t => t.status === 'APPROVED')); })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  const selectedTpl = templates.find(t => String(t.id) === String(form.templateId));
  const varCount = selectedTpl ? bodyVarCount(selectedTpl) : 0;

  const selectTemplate = (id) => {
    const tpl = templates.find(t => String(t.id) === String(id));
    const count = tpl ? bodyVarCount(tpl) : 0;
    setForm(f => ({ ...f, templateId: id, templateName: tpl?.name || '', templateLanguage: tpl?.language || f.templateLanguage }));
    setContactParams({});
    setGlobalParams(Array(count).fill(''));
  };

  const setParam = (cid, i, val) => setContactParams(p => {
    const row = [...(p[cid] || [])];
    row[i] = val;
    return { ...p, [cid]: row };
  });

  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map(c => c.id)));
  };

  const downloadTemplate = () => {
    const headers = ['phone_number', 'name', ...Array.from({ length: varCount }, (_, i) => `parameter_${i + 1}`)];
    const example = ['+541112345678', 'Juan', ...Array.from({ length: varCount }, (_, i) => `valor_${i + 1}`)];
    const csv = headers.join(',') + '\n' + example.join(',') + '\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → UTF-8 con acentos
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla_${form.templateName || 'campaña'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onCsvFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result || ''));
      setCsv({ recipients: parsed.recipients, paramCols: parsed.paramCols || [], error: parsed.error, fileName: file.name });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const recipientCount = mode === 'csv' ? csv.recipients.length : selected.size;

  const submit = async () => {
    setCreating(true);
    try {
      const payload = {
        name: form.name,
        templateId: form.templateId,
        templateName: form.templateName,
        templateLanguage: form.templateLanguage,
      };
      if (mode === 'csv') {
        payload.recipients = csv.recipients;
      } else {
        payload.recipients = contacts.filter(c => selected.has(c.id)).map(c => ({
          phone: c.phone, name: c.name,
          params: (paramMode === 'global' ? globalParams : (contactParams[c.id] || [])).map(v => v || ''),
        }));
      }
      const res = await window.api?.campaigns?.create(payload);
      if (res?.ok) { onCreated(res.id); onClose(); }
    } finally {
      setCreating(false);
    }
  };

  const canNext = step === 1 ? (!!form.name && !!form.templateId) : recipientCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-white">Nueva campaña — Paso {step} de 3</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${s <= step ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}>{s}</div>
                {s < 3 && <div className={`h-px w-8 ${s < step ? 'bg-green-600' : 'bg-gray-700'}`} />}
              </div>
            ))}
            <span className="ml-2 text-xs text-gray-400">{['Template', 'Destinatarios', 'Confirmar'][step - 1]}</span>
          </div>

          {/* Step 1 — Name + template + preview */}
          {step === 1 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Nombre de la campaña *</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Solo para referencia interna"
                  className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500" />
              </label>

              <label className="block">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Template aprobado *</span>
                {loadingTemplates ? (
                  <p className="text-xs text-gray-500 mt-1">Cargando templates…</p>
                ) : templates.length === 0 ? (
                  <p className="text-xs text-yellow-400 mt-1">No hay templates aprobados. Creá uno en la sección Templates.</p>
                ) : (
                  <select value={form.templateId} onChange={e => selectTemplate(e.target.value)}
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500">
                    <option value="">Seleccionar template…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                  </select>
                )}
              </label>

              {selectedTpl && (
                <div className="bg-[#0b141a] rounded-lg p-3">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1.5">Vista previa</span>
                  <div className="bg-[#202c33] rounded-lg rounded-tl-sm px-3 py-2 max-w-[90%] shadow">
                    <p className="text-sm text-gray-100 whitespace-pre-wrap">{bodyText(selectedTpl)}</p>
                  </div>
                  {varCount > 0 && <p className="text-[11px] text-gray-500 mt-2">Usa {varCount} variable{varCount > 1 ? 's' : ''}. Asignás los valores por destinatario en el paso siguiente.</p>}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Recipients (tabs) */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-gray-800 rounded-lg">
                {[['contacts', 'Desde contactos'], ['csv', 'Importar CSV']].map(([m, label]) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === m ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'contacts' ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{selected.size} / {contacts.length} seleccionados</span>
                    <button onClick={toggleAll} className="text-xs text-green-400 hover:text-green-300">
                      {selected.size === contacts.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                    {contacts.map(c => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                        <input type="checkbox" checked={selected.has(c.id)}
                          onChange={() => setSelected(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                          className="accent-green-500" />
                        <div>
                          <div className="text-sm text-gray-200">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.phone}</div>
                        </div>
                      </label>
                    ))}
                    {contacts.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Sin contactos. Usá Importar CSV.</p>}
                  </div>

                  {/* Variables */}
                  {varCount > 0 && selected.size > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">Variables ({varCount})</span>
                        <div className="flex gap-1 p-0.5 bg-gray-800 rounded-md">
                          {[['global', 'Iguales para todos'], ['per', 'Por destinatario']].map(([m, label]) => (
                            <button key={m} onClick={() => setParamMode(m)}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${paramMode === m ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {paramMode === 'global' ? (
                        <div className="grid grid-cols-2 gap-2">
                          {Array.from({ length: varCount }).map((_, i) => (
                            <label key={i} className="block">
                              <span className="text-[11px] text-gray-500 font-mono">{'{{' + (i + 1) + '}}'}</span>
                              <input value={globalParams[i] || ''} onChange={e => setGlobalParams(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                                placeholder={`Valor para {{${i + 1}}}`} className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500" />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {contacts.filter(c => selected.has(c.id)).map(c => (
                            <div key={c.id} className="bg-gray-800/50 rounded-lg px-3 py-2">
                              <div className="text-xs text-gray-300 mb-1">{c.name} <span className="text-gray-500 font-mono">{c.phone}</span></div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {Array.from({ length: varCount }).map((_, i) => (
                                  <input key={i} value={contactParams[c.id]?.[i] || ''} onChange={e => setParam(c.id, i, e.target.value)}
                                    placeholder={`{{${i + 1}}}`} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500" />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sample preview */}
                  {selectedTpl && selected.size > 0 && (() => {
                    const sample = contacts.find(c => selected.has(c.id));
                    const values = varCount === 0 ? [] : (paramMode === 'global' ? globalParams : (contactParams[sample?.id] || []));
                    return (
                      <div className="bg-[#0b141a] rounded-lg p-3">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1.5">
                          Ejemplo{varCount > 0 && paramMode === 'per' ? ` para ${sample?.name || 'destinatario'} (varía por contacto)` : ''}
                        </span>
                        <div className="bg-[#202c33] rounded-lg rounded-tl-sm px-3 py-2 max-w-[90%] shadow">
                          <p className="text-sm text-gray-100 whitespace-pre-wrap">{renderBody(bodyText(selectedTpl), values)}</p>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <label className="block border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-gray-600 transition-colors">
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => onCsvFile(e.target.files?.[0])} />
                    <svg className="h-7 w-7 text-gray-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    <p className="text-sm text-gray-300">{csv.fileName || 'Hacé click para elegir un .csv'}</p>
                    <p className="text-[11px] text-gray-500 mt-1">phone_number + columnas de parámetros</p>
                  </label>

                  <button onClick={downloadTemplate} className="w-full py-2 rounded-lg border border-gray-700 text-xs text-gray-200 hover:border-gray-600 transition-colors flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Descargar plantilla CSV
                  </button>

                  <div className="rounded-lg bg-gray-800 p-3 text-[11px] text-gray-400 space-y-0.5">
                    <p className="text-gray-300 font-medium">Formato:</p>
                    <p>• Primera columna: <span className="font-mono text-gray-300">phone_number</span> (con código de país).</p>
                    <p>• Opcional: <span className="font-mono text-gray-300">name</span> para el contacto.</p>
                    <p>• Resto de columnas = parámetros del body en orden ({varCount || 'N'} esperados).</p>
                    <p>• Separadores: coma, punto y coma, tab o pipe. UTF-8.</p>
                  </div>

                  {csv.error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{csv.error}</p>}

                  {csv.recipients.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-300 mb-1">{csv.recipients.length} destinatarios · {csv.paramCols.length} parámetro(s)</p>
                      {varCount > 0 && csv.paramCols.length !== varCount && (
                        <p className="text-[11px] text-yellow-400 mb-1">⚠ El template espera {varCount} parámetros y el CSV trae {csv.paramCols.length}.</p>
                      )}
                      <div className="border border-gray-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <tbody className="divide-y divide-gray-800">
                            {csv.recipients.slice(0, 50).map((r, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 font-mono text-gray-300">{r.phone}</td>
                                <td className="px-2 py-1 text-gray-400 truncate">{r.name}</td>
                                <td className="px-2 py-1 text-gray-500 truncate">{r.params.join(' · ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">Los destinatarios se guardan también como contactos.</p>
                      {selectedTpl && (
                        <div className="bg-[#0b141a] rounded-lg p-3 mt-2">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1.5">
                            Ejemplo para {csv.recipients[0]?.name || csv.recipients[0]?.phone} (varía por fila)
                          </span>
                          <div className="bg-[#202c33] rounded-lg rounded-tl-sm px-3 py-2 max-w-[90%] shadow">
                            <p className="text-sm text-gray-100 whitespace-pre-wrap">{renderBody(bodyText(selectedTpl), csv.recipients[0]?.params || [])}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Campaña</span><span className="text-gray-100 font-medium">{form.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Template</span><span className="text-gray-100 font-mono font-medium">{form.templateName}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Destinatarios</span><span className="text-gray-100 font-medium">{recipientCount} ({mode === 'csv' ? 'CSV' : 'contactos'})</span></div>
                {varCount > 0 && <div className="flex justify-between"><span className="text-gray-400">Variables</span><span className="text-gray-100">{varCount} · {mode === 'csv' ? 'por fila (CSV)' : paramMode === 'global' ? 'iguales para todos' : 'por destinatario'}</span></div>}
              </div>
              {/* <div className="bg-gray-800/60 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-400">
                Se crea como borrador. Lo enviás o programás desde la lista.
              </div> */}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5 shrink-0">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors">
              Siguiente
            </button>
          ) : (
            <button onClick={submit} disabled={creating || recipientCount === 0}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">
              {creating ? 'Creando…' : 'Crear campaña'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stats row ───────────────────────────────────────────────────────────────
function Stat({ label, value, color, sub }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-semibold ${color || 'text-gray-200'}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      {sub != null && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(null); // campaign id with an in-flight action
  const [scheduling, setScheduling] = useState(null); // campaign id showing the schedule input
  const [scheduleAt, setScheduleAt] = useState('');
  const [importing, setImporting] = useState(false);
  const pollRef = useRef(null);
  const importedRef = useRef(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    window.api?.campaigns?.list().then(c => { setCampaigns(c || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const importFromKapso = useCallback(async (silent = false) => {
    if (!silent) setImporting(true);
    const res = await window.api?.campaigns?.importBroadcasts();
    if (!silent) setImporting(false);
    if (res?.ok) load();
    else if (!silent) alert(res?.error || 'Error importando');
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // Poll live stats for any active (sending/scheduled) campaign every 10s
  useEffect(() => {
    const hasActive = campaigns.some(c => c.status === 'sending' || c.status === 'scheduled');
    if (!hasActive) return;
    pollRef.current = setInterval(async () => {
      const active = campaigns.filter(c => (c.status === 'sending' || c.status === 'scheduled') && !c.stats_frozen);
      for (const c of active) {
        const res = await window.api?.campaigns?.refreshStats(c.id);
        if (res?.ok && res.campaign) setCampaigns(prev => prev.map(x => x.id === c.id ? res.campaign : x));
      }
    }, 10_000);
    return () => clearInterval(pollRef.current);
  }, [campaigns]);

  const handleSend = async (id, scheduledAt = null) => {
    setBusy(id);
    const res = await window.api?.campaigns?.send(id, scheduledAt ? { scheduledAt } : undefined);
    setBusy(null);
    setScheduling(null);
    setScheduleAt('');
    if (!res?.ok) {
      alert(res?.error || 'Error al enviar');
    } else if (res.warnings?.length || res.duplicates) {
      const parts = [`${res.added} destinatarios cargados`];
      if (res.duplicates) parts.push(`${res.duplicates} duplicados omitidos`);
      if (res.warnings?.length) parts.push(`${res.warnings.length} con problemas:\n• ${res.warnings.slice(0, 5).join('\n• ')}`);
      alert(parts.join('\n'));
    }
    load();
  };

  const handleRefresh = async (id) => {
    setBusy(id);
    const res = await window.api?.campaigns?.refreshStats(id);
    setBusy(null);
    if (res?.ok && res.campaign) setCampaigns(prev => prev.map(x => x.id === id ? res.campaign : x));
  };

  const handleCancel = async (id) => {
    if (!confirm('¿Cancelar la programación? Vuelve a borrador.')) return;
    setBusy(id);
    await window.api?.campaigns?.cancel(id);
    setBusy(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar campaña?')) return;
    await window.api?.campaigns?.delete(id);
    load();
  };

  const hasStats = (c) => c.kapso_broadcast_id && ['sending', 'completed', 'failed'].includes(c.status);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campañas</h1>
          <p className="text-sm text-gray-400 mt-1">{campaigns.length} campañas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => importFromKapso(false)} disabled={importing}
            className="flex items-center gap-2 px-3 py-2 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 disabled:opacity-40 rounded-lg transition-colors">
            <svg className={`h-4 w-4 ${importing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {importing ? 'Importando…' : ''}
          </button>
          <button onClick={() => setWizard(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-sm font-medium text-white rounded-lg transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nueva campaña
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin campañas. Creá tu primera difusión.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const total = c.total_recipients || c.total_contacts || 0;
            const progress = total ? Math.round(((c.sent_count + c.error_count) / total) * 100) : 0;
            return (
              <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-100 truncate hover:text-green-400 transition-colors">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>{total} contactos</span>
                      <span className="font-mono">{c.template_name}</span>
                      {c.scheduled_at && c.status === 'scheduled' && <span className="text-blue-400">→ {new Date(c.scheduled_at).toLocaleString('es-AR')}</span>}
                      <span>{c.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => navigate(`/campaigns/${c.id}`)} title="Ver campaña"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-gray-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </button>
                    {hasStats(c) && !c.stats_frozen && (
                      <button onClick={() => handleRefresh(c.id)} disabled={busy === c.id} title="Actualizar métricas"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-gray-700 transition-colors">
                        <svg className={`h-4 w-4 ${busy === c.id ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                      </button>
                    )}
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {wizard && <CampaignWizard onClose={() => setWizard(false)} onCreated={(id) => id ? navigate(`/campaigns/${id}`) : load()} />}
    </div>
  );
}
