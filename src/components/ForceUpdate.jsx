import { useUpdater } from '../context/UpdateContext';

export default function ForceUpdate() {
  const { forceCheck } = useUpdater();

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-10 py-8 shadow-2xl max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">WA CRM Desktop</p>
          <div className="text-3xl mb-3">⬆️</div>
          <div className="text-xl font-semibold text-gray-100">Actualización requerida</div>
          <div className="mt-2 text-sm text-gray-400">
            Tu versión quedó desactualizada. Instalá la última versión para continuar.
          </div>
          <button
            type="button"
            onClick={() => forceCheck?.()}
            className="mt-6 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-sm font-semibold text-white transition-colors"
          >
            Actualizar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
