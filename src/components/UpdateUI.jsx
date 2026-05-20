import { useUpdater } from '../context/UpdateContext';

export default function UpdateUI() {
  const { status, progress, error, installUpdate, checkForUpdates, downloadUpdate } = useUpdater();

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 text-sm text-gray-100 shadow-2xl">
      {status === 'checking' && <p className="text-gray-400">Buscando actualizaciones…</p>}

      {status === 'available' && (
        <div className="space-y-2.5">
          <p className="font-medium">Nueva versión disponible</p>
          <button
            onClick={() => downloadUpdate?.()}
            className="w-full rounded-lg bg-green-600 hover:bg-green-500 px-3 py-2 text-xs font-semibold text-white transition-colors"
          >
            Descargar actualización
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="space-y-2">
          <p className="text-gray-300">Descargando actualización…</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      )}

      {status === 'downloaded' && (
        <div className="space-y-2.5">
          <p className="font-medium text-green-400">Actualización lista</p>
          <button
            onClick={() => installUpdate?.()}
            className="w-full rounded-lg bg-green-600 hover:bg-green-500 px-3 py-2 text-xs font-semibold text-white transition-colors"
          >
            Reiniciar para actualizar
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2.5">
          <p className="text-red-400">Error al actualizar</p>
          {error && <p className="text-xs text-gray-500">{error}</p>}
          <button
            onClick={() => checkForUpdates?.()}
            className="w-full rounded-lg border border-gray-700 hover:border-gray-600 px-3 py-2 text-xs font-medium text-gray-300 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
