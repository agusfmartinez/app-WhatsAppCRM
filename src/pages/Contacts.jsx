import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const TAG_COLORS = ['#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const PAGE_SIZE = 50;

function TagBadge({ tag }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: tag.color + '22', color: tag.color }}>
      {tag.name}
    </span>
  );
}

function ContactModal({ contact, tags, onSave, onClose }) {
  // Contacts synced from Kapso have kapso_id — lock name + phone (no Kapso update endpoint)
  const isKapso = !!contact?.kapso_id;

  const [form, setForm] = useState({
    name: contact?.name || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    company: contact?.company || '',
    notes: contact?.notes || '',
    tagIds: contact?.tags?.map(t => t.id) || [],
  });

  const toggle = (id) => setForm(f => ({
    ...f,
    tagIds: f.tagIds.includes(id) ? f.tagIds.filter(t => t !== id) : [...f.tagIds, id],
  }));

  const submit = (e) => { e.preventDefault(); onSave(form); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">{contact ? 'Editar contacto' : 'Nuevo contacto'}</h2>
            {isKapso && (
              <span className="text-[11px] text-green-400 flex items-center gap-1 mt-0.5">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.9 8.6l-6.8 9c-.2.3-.5.4-.8.4s-.6-.1-.8-.4l-3.4-4.5c-.4-.5-.3-1.2.2-1.6.5-.4 1.2-.3 1.6.2l2.6 3.4 6-7.9c.4-.5 1.1-.6 1.6-.2.5.4.6 1.1.2 1.6z"/></svg>
                Contacto de WhatsApp
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Nombre: always editable (local CRM field) */}
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              Nombre *
              {isKapso && contact?.wa_name && (
                <span className="ml-2 text-gray-500 normal-case font-normal">WhatsApp Nombre: {contact.wa_name}</span>
              )}
            </span>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </label>
          {/* Teléfono: locked for Kapso, normalized for new contacts */}
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Teléfono *</span>
            <input
              type="tel"
              required={!isKapso}
              readOnly={isKapso}
              value={form.phone}
              placeholder="541134940534"
              onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, '') }))}
              onBlur={e => {
                if (isKapso) return;
                // Normalize Argentine mobile: strip leading 0/15, add 54 country code
                let p = e.target.value.replace(/[^0-9]/g, '');
                if (!p) return;
                // Remove leading 9 if already has 549 (user typed 5491134940534 → keep as 541134940534)
                if (p.startsWith('549') && p.length === 13) p = '54' + p.slice(3);
                // Add country code if missing
                if (!p.startsWith('54')) {
                  if (p.startsWith('0')) p = p.slice(1); // strip leading 0
                  p = '54' + p;
                }
                setForm(f => ({ ...f, phone: p }));
              }}
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none ${!isKapso ? 'bg-gray-800 border-gray-700 text-gray-100 focus:ring-1 focus:ring-green-500' : 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed'}`}
            />
            {!isKapso && (
              <span className="text-[11px] text-gray-500 mt-0.5 block">Formato: 541134940534 (país + área + número, sin el 9)</span>
            )}
          </label>
          {/* Email + Company: always editable */}
          {[['Email', 'email', 'email'], ['Empresa', 'company', 'text']].map(([label, key, type]) => (
            <label key={key} className="block">
              <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Notas</span>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
            />
          </label>
          {tags.length > 0 && (
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Etiquetas</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button key={tag.id} type="button" onClick={() => toggle(tag.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${form.tagIds.includes(tag.id) ? 'border-transparent' : 'border-gray-700 bg-transparent text-gray-400'}`}
                    style={form.tagIds.includes(tag.id) ? { backgroundColor: tag.color + '33', color: tag.color, borderColor: tag.color + '55' } : {}}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium text-white transition-colors">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState(null);
  const [modal, setModal] = useState(null); // null | 'new' | contact obj
  const [deleteConfirm, setDeleteConfirm] = useState(null); // contact id pending delete
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, t] = await Promise.all([
      window.api?.contacts?.list({ search, tagId: filterTag, limit: PAGE_SIZE, offset: 0 }) ?? [],
      window.api?.tags?.list() ?? [],
    ]);
    setContacts(c || []);
    setTags(t || []);
    setHasMore((c || []).length === PAGE_SIZE);
    setLoading(false);
  }, [search, filterTag]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const batch = await window.api?.contacts?.list({ search, tagId: filterTag, limit: PAGE_SIZE, offset: contacts.length }) ?? [];
    setContacts(prev => [...prev, ...(batch || [])]);
    setHasMore((batch || []).length === PAGE_SIZE);
    setLoadingMore(false);
  }, [search, filterTag, contacts.length]);

  useEffect(() => { load(); }, [load]);

  // Auto-sync from Kapso on first mount (background, non-blocking)
  useEffect(() => {
    const autoSync = async () => {
      const status = await window.api?.whatsapp?.getStatus?.().catch(() => null);
      if (status?.status !== 'connected') return;
      const res = await window.api?.syncKapsoContacts?.().catch(() => null);
      if (res?.ok && (res.created > 0 || res.updated > 0)) {
        setSyncResult(res);
        load(); // reload list with new/updated contacts
      }
    };
    autoSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (form) => {
    if (modal === 'new') {
      await window.api?.contacts?.create(form);
    } else {
      await window.api?.contacts?.update(modal.id, form);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    await window.api?.contacts?.delete(id);
    setDeleteConfirm(null);
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contactos</h1>
          <p className="text-sm text-gray-400 mt-1">{contacts.length}{hasMore ? '+' : ''} contactos</p>
        </div>
        <div className="flex items-center gap-2">
          {syncResult && syncResult.ok && (
            <span className="text-xs text-green-400">
              ✓ +{syncResult.created} nuevos, {syncResult.updated} actualizados
            </span>
          )}
          {syncResult && !syncResult.ok && (
            <span className="text-xs text-red-400" title={syncResult.error}>
              ✗ {syncResult.error?.slice(0, 40)}
            </span>
          )}
          <button
            onClick={async () => {
              setSyncing(true); setSyncResult(null);
              try {
                const res = await window.api?.syncKapsoContacts?.() ?? { ok: false, error: 'Sin respuesta del proceso principal' };
                setSyncResult(res);
                if (res?.ok) load();
              } catch (err) {
                setSyncResult({ ok: false, error: err.message || 'Error inesperado' });
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-700 hover:border-gray-600 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors disabled:opacity-40"
          >
            <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {syncing ? 'Sincronizando...' : 'Sync Kapso'}
          </button>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-sm font-medium text-white rounded-lg transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo contacto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        {tags.map(tag => (
          <button key={tag.id} onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${filterTag === tag.id ? 'border-transparent' : 'bg-transparent border-gray-700 text-gray-400'}`}
            style={filterTag === tag.id ? { backgroundColor: tag.color + '22', color: tag.color, borderColor: tag.color + '44' } : {}}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando...</div>
      ) : contacts.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin contactos. Creá uno nuevo o importá un CSV.</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Empresa</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-400 font-medium">Etiquetas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-100 font-medium">{c.name}</span>
                      {c.kapso_id && (
                        <svg className="h-3 w-3 text-green-500 shrink-0" title="Contacto de WhatsApp" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L.057 23.177a.75.75 0 00.92.92l5.57-1.338A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.18-1.43l-.37-.22-3.834.922.937-3.724-.243-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-400">{c.company || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.map(t => <TagBadge key={t.id} tag={t} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Go to conversation — only Kapso contacts have conversations */}
                      {c.kapso_id && (
                        <button
                          onClick={() => navigate('/inbox', { state: { filterPhone: c.phone } })}
                          title="Ver conversación en Inbox"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-gray-700 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                        </button>
                      )}
                      <button onClick={() => setModal(c)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      {/* Delete only for local-only contacts — Kapso contacts recreate on next sync */}
                      {!c.kapso_id && (
                        deleteConfirm === c.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-red-400">¿Eliminar?</span>
                            <button onClick={() => handleDelete(c.id)} className="text-[11px] text-red-400 hover:text-red-300 font-medium px-1">Sí</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-[11px] text-gray-500 hover:text-gray-300 px-1">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(c.id)}
                            title="Eliminar contacto local"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={loadingMore}
            className="px-4 py-2 text-sm text-gray-300 border border-gray-700 rounded-lg hover:border-gray-600 disabled:opacity-40 transition-colors">
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}

      {modal && (
        <ContactModal
          contact={modal === 'new' ? null : modal}
          tags={tags}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
