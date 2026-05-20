import { useEffect, useState } from 'react';

function KpiCard({ label, value, icon, color }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex items-center gap-4">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value ?? '—'}</div>
        <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [waStatus, setWaStatus] = useState('disconnected');

  useEffect(() => {
    window.api?.stats?.().then(setStats).catch(() => {});
    window.api?.whatsapp?.getStatus?.().then(s => setWaStatus(s?.status || 'disconnected')).catch(() => {});

    const handler = (e) => { if (e.type === 'status') setWaStatus(e.status); };
    window.api?.onWhatsAppEvent?.(handler);
    return () => window.api?.offWhatsAppEvent?.(handler);
  }, []);

  const responseRate = stats?.messagesIn && stats?.messagesSent
    ? Math.round((stats.messagesIn / stats.messagesSent) * 100)
    : 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Resumen de actividad</p>
      </div>

      {/* WA status banner */}
      <div className={`mb-6 flex items-center gap-3 rounded-xl px-5 py-3.5 border ${
        waStatus === 'connected'
          ? 'bg-green-500/10 border-green-500/20 text-green-400'
          : 'bg-gray-800 border-gray-700 text-gray-400'
      }`}>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
          waStatus === 'connected' ? 'bg-green-500' :
          waStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-600'
        }`} />
        <span className="text-sm font-medium">
          WhatsApp: {waStatus === 'connected' ? 'Conectado' : waStatus === 'connecting' ? 'Conectando...' : 'Desconectado — configurá el proveedor en Ajustes'}
        </span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Contactos"
          value={stats?.contacts ?? '…'}
          color="bg-blue-500/15 text-blue-400"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 5.87a4 4 0 100-8 4 4 0 000 8zm6-12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
        />
        <KpiCard
          label="Mensajes enviados"
          value={stats?.messagesSent ?? '…'}
          color="bg-green-500/15 text-green-400"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>}
        />
        <KpiCard
          label="Campañas"
          value={stats?.campaigns ?? '…'}
          color="bg-purple-500/15 text-purple-400"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>}
        />
        <KpiCard
          label="Tasa de respuesta"
          value={`${responseRate}%`}
          color="bg-orange-500/15 text-orange-400"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
        />
      </div>

      {/* Empty state hint */}
      {stats && stats.contacts === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">Sin datos aún. Empezá importando contactos.</p>
        </div>
      )}
    </div>
  );
}
