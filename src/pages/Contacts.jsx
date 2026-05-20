import { useEffect, useState, useCallback } from 'react';

const TAG_COLORS = ['#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

function TagBadge({ tag }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: tag.color + '22', color: tag.color }}>
      {tag.name}
    </span>
  );
}

function ContactModal({ contact, tags, onSave, onClose }) {
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
          <h2 className="text-base font-semibold text-white">{contact ? 'Editar contacto' : 'Nuevo contacto'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {[['Nombre *', 'name', 'text', true], ['Teléfono *', 'phone', 'tel', true], ['Email', 'email', 'email', false], ['Empresa', 'company', 'text', false]].map(([label, key, type, req]) => (
            <label key={key} className="block">
              <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
              <input
                type={type}
                required={req}
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
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState(null);
  const [modal, setModal] = useState(null); // null | 'new' | contact obj
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, t] = await Promise.all([
      window.api?.contacts?.list({ search, tagId: filterTag }) ?? [],
      window.api?.tags?.list() ?? [],
    ]);
    setContacts(c || []);
    setTags(t || []);
    setLoading(false);
  }, [search, filterTag]);

  useEffect(() => { load(); }, [load]);

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
    if (!confirm('¿Eliminar contacto?')) return;
    await window.api?.contacts?.delete(id);
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contactos</h1>
          <p className="text-sm text-gray-400 mt-1">{contacts.length} contactos</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-sm font-medium text-white rounded-lg transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo contacto
        </button>
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
                  <td className="px-4 py-3 text-gray-100 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-400">{c.company || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.map(t => <TagBadge key={t.id} tag={t} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setModal(c)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
