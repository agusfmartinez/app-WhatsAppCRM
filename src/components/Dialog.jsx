import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const DialogContext = createContext(null);

export function useDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }) {
  const [state, setState] = useState(null); // { type, title, message, tone, resolve }

  const alert = useCallback((message, opts = {}) =>
    new Promise(resolve => setState({ type: 'alert', message, title: opts.title, tone: opts.tone, resolve })), []);

  const confirm = useCallback((message, opts = {}) =>
    new Promise(resolve => setState({ type: 'confirm', message, title: opts.title, tone: opts.tone, resolve })), []);

  const close = useCallback((value) => {
    setState(s => { s?.resolve?.(value); return null; });
  }, []);

  // Esc cancels, Enter confirms/acknowledges
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close(state.type === 'confirm' ? false : undefined);
      else if (e.key === 'Enter') close(state.type === 'confirm' ? true : undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  const destructive = state?.tone === 'danger';

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => close(state.type === 'confirm' ? false : undefined)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              {state.title && <h3 className="text-base font-semibold text-white mb-1.5">{state.title}</h3>}
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{state.message}</p>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              {state.type === 'confirm' && (
                <button onClick={() => close(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
                  Cancelar
                </button>
              )}
              <button onClick={() => close(state.type === 'confirm' ? true : undefined)} autoFocus
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors ${destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
                {state.type === 'confirm' ? 'Confirmar' : 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
