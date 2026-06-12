import { useEffect, useState } from 'react';

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}

export default function Reports() {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    window.api?.stats?.().then(setStats).catch(() => {});
    // Campañas con broadcast (enviadas), más recientes primero
    window.api?.campaigns?.list().then(c => setCampaigns((c || []).filter(x => x.kapso_broadcast_id))).catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <p className="text-sm text-gray-400 mt-1">Métricas generales de actividad</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Summary */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Resumen general</h2>
          <StatRow label="Contactos totales" value={stats?.contacts ?? '…'} />
          <StatRow label="Etiquetas" value={stats?.tags ?? '…'} />
          <StatRow label="Mensajes enviados" value={stats?.messagesSent ?? '…'} sub="Total en campañas" />
          <StatRow label="Entregados" value={stats?.delivered ?? '…'} sub={`${stats?.deliveryRate ?? 0}% de enviados`} />
          <StatRow label="Leídos" value={stats?.read ?? '…'} sub={`${stats?.readRate ?? 0}% de enviados`} />
          <StatRow label="Respondieron" value={stats?.responded ?? '…'} sub={`${stats?.responseRate ?? 0}% tasa de respuesta`} />
          <StatRow label="Errores" value={stats?.errors ?? '…'} />
          <StatRow label="Campañas enviadas" value={stats?.campaignsSent ?? campaigns.length} />
        </div>

        {/* Campaign detail */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Resultado de campañas</h2>
          {campaigns.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin campañas enviadas</p>
          ) : (
            <div className="space-y-3">
              {campaigns.slice(0, 8).map(c => {
                const total = c.total_recipients || c.total_contacts || 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-200 truncate flex-1 mr-3">{c.name}</span>
                      <span className="text-gray-400 shrink-0 text-xs">{c.sent_count}/{total} enviados</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                      <span className="text-green-500">{c.delivered_count} entregados</span>
                      <span className="text-blue-400">{c.read_count} leídos</span>
                      <span className="text-blue-400">{c.responded_count} resp.</span>
                      {c.error_count > 0 && <span className="text-red-400">{c.error_count} errores</span>}
                    </div>
                  </div>
                );
              })}
              {campaigns.length > 8 && (
                <p className="text-xs text-gray-500 text-center pt-1">+{campaigns.length - 8} más</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
