export default function SessionExpired() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-10 py-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">WA CRM Desktop</p>
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-xl font-semibold text-gray-100">Sesión vencida</div>
          <div className="mt-2 text-sm text-gray-400">Redirigiendo al inicio de sesión…</div>
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}
