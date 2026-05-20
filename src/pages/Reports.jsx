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
    window.api?.campaigns?.list().then(c => setCampaigns((c || []).filter(x => x.status === 'sent'))).catch(() => {});
  }, []);

  const responseRate = stats?.messagesIn && stats?.messagesSent
    ? ((stats.messagesIn / stats.messagesSent) * 100).toFixed(1)
    : '0';

  const totalSentCampaigns = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalErrorsCampaigns = campaigns.reduce((a, c) => a + (c.error_count || 0), 0);

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
          <StatRow label="Mensajes enviados" value={stats?.messagesSent ?? '…'} sub="Total histórico" />
          <StatRow label="Mensajes recibidos" value={stats?.messagesIn ?? '…'} />
          <StatRow label="Tasa de respuesta" value={`${responseRate}%`} sub="Respuestas / enviados" />
          <StatRow label="Campañas enviadas" value={campaigns.length} />
        </div>

        {/* Campaign detail */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Resultado de campañas</h2>
          {campaigns.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin campañas enviadas</p>
          ) : (
            <>
              <StatRow label="Mensajes enviados (campañas)" value={totalSentCampaigns} />
              <StatRow label="Errores" value={totalErrorsCampaigns} />
              <div className="mt-4 space-y-2">
                {campaigns.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 truncate flex-1 mr-3">{c.name}</span>
                    <span className="text-gray-300 shrink-0">{c.sent_count}/{c.total_contacts}</span>
                  </div>
                ))}
                {campaigns.length > 5 && (
                  <p className="text-xs text-gray-500 text-center pt-1">+{campaigns.length - 5} más</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
