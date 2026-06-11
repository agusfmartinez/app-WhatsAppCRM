import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialog } from '../components/Dialog.jsx';

const STATUS_LABELS = { draft: 'Borrador', scheduled: 'Programada', sending: 'Enviando…', completed: 'Completada', failed: 'Fallida' };
const STATUS_COLORS = {
  draft: 'bg-gray-700 text-gray-300', scheduled: 'bg-blue-500/15 text-blue-400',
  sending: 'bg-yellow-500/15 text-yellow-400', completed: 'bg-green-500/15 text-green-400', failed: 'bg-red-500/15 text-red-400',
};
const RCPT_COLORS = {
  sent: 'text-gray-300', delivered: 'text-green-400', read: 'text-blue-400',
  responded: 'text-blue-400', failed: 'text-red-400', pending: 'text-yellow-400',
};
const fmtTime = (t) => t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const pct = (num, den) => den > 0 ? `${Math.round((num / den) * 100)}%` : '0%';

function rcptVars(r) {
  if (Array.isArray(r.params)) return r.params;
  const body = r.template_components?.find(c => (c.type || '').toLowerCase() === 'body');
  return (body?.parameters || []).map(p => p.text ?? '');
}

function mapLocal(d) {
  return (d?.contacts || []).map(x => {
    let params = []; if (x.params) { try { params = JSON.parse(x.params) || []; } catch {} }
    return {
      phone_number: x.phone, status: x.status || 'pending', params,
      delivered_at: x.delivered_at, read_at: x.read_at, responded_at: x.responded_at,
      failed_at: x.failed_at, error_message: x.error_message,
    };
  });
}

function StatCard({ label, value, sub, valueClass }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <div className={`text-2xl font-bold mt-2 ${valueClass || 'text-white'}`}>{value}</div>
      {sub != null && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ConfigRow({ label, value }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-200 mt-0.5">{value || '—'}</div>
    </div>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [c, setC] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [numberName, setNumberName] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [openErr, setOpenErr] = useState({});
  const pollRef = useRef(null);

  // force=true (refresh button) or a live send pulls from Kapso; otherwise local DB.
  const load = useCallback(async (force = false) => {
    const d = await window.api?.campaigns?.get(id);
    if (!d) { setLoading(false); return; }

    const wantLive = d.kapso_broadcast_id && (force || d.status === 'sending');
    if (wantLive) {
      await window.api?.campaigns?.refreshStats(id).catch(() => {});
      const fresh = await window.api?.campaigns?.get(id);
      setC(fresh || d);
      const r = await window.api?.campaigns?.recipients(id).catch(() => null);
      setRecipients(r?.ok ? (r.recipients || []) : mapLocal(fresh || d));
    } else {
      setC(d);
      const local = mapLocal(d);
      if (local.length) setRecipients(local);
      else if (d.kapso_broadcast_id) {
        // No local snapshot yet → one-time pull so the table isn't empty
        const r = await window.api?.campaigns?.recipients(id).catch(() => null);
        setRecipients(r?.ok ? (r.recipients || []) : []);
      } else setRecipients([]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Cache the connected number name — stable, avoids an API call per detail open
    const cached = localStorage.getItem('wa_number_name');
    if (cached) { setNumberName(cached); return; }
    window.api?.whatsapp?.getPhoneNumberDetails?.().then(r => {
      if (r?.ok !== false) {
        const n = r?.verified_name || r?.display_phone_number || '';
        setNumberName(n);
        if (n) localStorage.setItem('wa_number_name', n);
      }
    }).catch(() => {});
  }, []);

  // Poll while sending
  useEffect(() => {
    if (c?.status !== 'sending') return;
    pollRef.current = setInterval(load, 10_000);
    return () => clearInterval(pollRef.current);
  }, [c?.status, load]);

  const doSend = async (scheduledAt = null) => {
    setBusy(true);
    const res = await window.api?.campaigns?.send(id, scheduledAt ? { scheduledAt } : undefined);
    setBusy(false); setScheduling(false); setScheduleAt('');
    if (!res?.ok) { dialog.alert(res?.error || 'Error al enviar', { title: 'No se pudo enviar', tone: 'danger' }); return; }
    if (res.warnings?.length || res.duplicates) {
      const parts = [`${res.added} cargados`];
      if (res.duplicates) parts.push(`${res.duplicates} duplicados`);
      if (res.warnings?.length) parts.push(`${res.warnings.length} con problemas:\n• ${res.warnings.slice(0, 5).join('\n• ')}`);
      dialog.alert(parts.join('\n'), { title: 'Enviado con avisos' });
    }
    load();
  };

  const doCancel = async () => {
    if (!(await dialog.confirm('¿Cancelar la programación? Vuelve a borrador.'))) return;
    setBusy(true); await window.api?.campaigns?.cancel(id); setBusy(false); load();
  };

  const doDelete = async () => {
    if (!(await dialog.confirm('¿Eliminar campaña?', { tone: 'danger' }))) return;
    await window.api?.campaigns?.delete(id);
    navigate('/campaigns');
  };

  if (loading) return <div className="p-8 text-center text-gray-500 text-sm">Cargando…</div>;
  if (!c) return <div className="p-8 text-center text-gray-500 text-sm">Campaña no encontrada.</div>;

  const total = c.total_recipients || c.total_contacts || 0;
  const progress = total ? Math.round(((c.sent_count + c.error_count) / total) * 100) : 0;
  const hasStats = c.kapso_broadcast_id && ['sending', 'completed', 'failed'].includes(c.status);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/campaigns')} className="text-gray-500 hover:text-gray-200 mt-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{c.name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] || STATUS_COLORS.draft}`}>{STATUS_LABELS[c.status] || c.status}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Creada {c.created_at?.slice(0, 10)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.status === 'draft' && (
            <>
              <button onClick={() => doSend()} disabled={busy} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
                {busy ? 'Enviando…' : 'Enviar ahora'}
              </button>
              <button onClick={() => setScheduling(s => !s)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-600 transition-colors">Programar</button>
            </>
          )}
          {c.status === 'scheduled' && (
            <button onClick={doCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-600 transition-colors">Cancelar</button>
          )}
          {hasStats && !c.stats_frozen && (
            <button onClick={() => load(true)} disabled={busy} title="Actualizar" className="p-2 rounded-lg text-gray-500 hover:text-green-400 hover:bg-gray-800 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
          )}
          <button onClick={doDelete} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>

      {/* Schedule input */}
      {scheduling && (
        <div className="flex items-center gap-2 mb-6">
          <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500" />
          <button onClick={() => scheduleAt && doSend(new Date(scheduleAt).toISOString())} disabled={!scheduleAt || busy}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium text-white transition-colors">Confirmar programación</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <StatCard label="Destinatarios" value={total} />
        <StatCard label="Enviados" value={c.sent_count} sub={`${pct(c.sent_count, total)} completado`} />
        <StatCard label="Entregados" value={c.delivered_count} sub={`${pct(c.delivered_count, total)} entrega`} />
        <StatCard label="Leídos" value={c.read_count} sub={`${pct(c.read_count, total)} lectura`} />
        <StatCard label="Respondieron" value={c.responded_count} sub={`${c.response_rate || 0}% respuesta`} />
        <StatCard label="Fallidos" value={c.error_count} valueClass={c.error_count ? 'text-red-400' : 'text-white'} sub={`${pct(c.error_count, total)} error`} />
      </div>

      {/* Sending progress */}
      {c.status === 'sending' && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Progreso de envío</h3>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">{c.sent_count + c.error_count} de {total} mensajes procesados</p>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Configuración</h3>
        <div className="grid grid-cols-2 gap-4">
          <ConfigRow label="Número de WhatsApp" value={numberName} />
          <ConfigRow label="Template" value={c.template_name} />
          <ConfigRow label="Programada" value={c.scheduled_at ? fmtTime(c.scheduled_at) : 'No programada'} />
          <ConfigRow label="Iniciada" value={c.started_at ? fmtTime(c.started_at) : 'No iniciada'} />
          {c.completed_at && <ConfigRow label="Completada" value={fmtTime(c.completed_at)} />}
          {c.stats_updated_at && <ConfigRow label="Métricas" value={c.stats_frozen ? 'Finales' : `Actualizadas ${fmtTime(c.stats_updated_at)}`} />}
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Destinatarios ({recipients.length})</h3>
        {recipients.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">Sin destinatarios.</p>
        ) : (
          <div className="border border-gray-700 rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-900 sticky top-0">
                <tr className="text-gray-400">
                  <th className="text-left px-3 py-2 font-medium">Teléfono</th>
                  <th className="text-left px-3 py-2 font-medium">Variables</th>
                  <th className="text-left px-3 py-2 font-medium">Estado</th>
                  <th className="text-left px-3 py-2 font-medium">Enviado</th>
                  <th className="text-left px-3 py-2 font-medium">Entregado</th>
                  <th className="text-left px-3 py-2 font-medium">Leído</th>
                  <th className="text-left px-3 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recipients.map(r => {
                  const vars = rcptVars(r);
                  const key = r.id || r.phone_number;
                  const open = openErr[key];
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td className="px-3 py-2 font-mono text-gray-300">+{String(r.phone_number).replace(/[^0-9]/g, '')}</td>
                        <td className="px-3 py-2 text-gray-400 truncate max-w-[120px]">{vars.length ? vars.map((v, i) => `${i + 1}:${v}`).join(' · ') : '—'}</td>
                        <td className={`px-3 py-2 font-medium ${RCPT_COLORS[r.status] || 'text-gray-300'}`}>{r.status}</td>
                        <td className="px-3 py-2 text-gray-400">{fmtTime(r.sent_at)}</td>
                        <td className="px-3 py-2 text-gray-400">{fmtTime(r.delivered_at)}</td>
                        <td className="px-3 py-2 text-gray-400">{fmtTime(r.read_at)}</td>
                        <td className="px-3 py-2">
                          {r.error_message ? (
                            <button onClick={() => setOpenErr(o => ({ ...o, [key]: !o[key] }))}
                              className="flex items-center gap-1 text-red-400/80 hover:text-red-300 max-w-[200px]">
                              <svg className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                              <span className="truncate">{r.error_message}</span>
                            </button>
                          ) : <span className="text-gray-500">—</span>}
                        </td>
                      </tr>
                      {open && r.error_message && (
                        <tr>
                          <td colSpan={7} className="px-3 py-2 bg-red-500/5 text-red-300/90 text-[11px] whitespace-pre-wrap break-all">
                            {r.error_message}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
