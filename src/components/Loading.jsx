import { useEffect, useState } from 'react';

export default function Loading() {
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <div className="h-12 w-12 rounded-xl bg-green-600 flex items-center justify-center">
          <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.933 1.395 5.608L.057 23.177a.75.75 0 00.92.92l5.57-1.338A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.18-1.43l-.37-.22-3.834.922.937-3.724-.243-.384A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-10 py-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">WA CRM Desktop</p>
          <div className="text-xl font-semibold text-gray-100">Validando acceso…</div>
          <div className="mt-1.5 text-sm text-gray-400">Verificando sesión y licencia</div>

          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-green-500" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-green-500 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-green-500 [animation-delay:300ms]" />
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            disabled={secondsLeft > 0}
            className={`mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-gray-300 transition border ${
              secondsLeft > 0
                ? 'border-gray-800 opacity-40 cursor-not-allowed'
                : 'border-gray-700 hover:border-gray-600 hover:text-gray-100'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" /><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
            </svg>
            {secondsLeft > 0 ? `Recargar en ${secondsLeft}s` : 'Recargar'}
          </button>
        </div>
      </div>
    </div>
  );
}
