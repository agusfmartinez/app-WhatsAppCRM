import { useNavigate, useLocation } from 'react-router-dom';

export default function Pending() {
  const navigate = useNavigate();
  const { state } = useLocation();

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-4">
          <div className="text-3xl">⏳</div>
          <h2 className="text-lg font-semibold text-white">Cuenta en revisión</h2>
          <p className="text-sm text-gray-400">
            Tu solicitud fue enviada. Cuando el administrador te habilite, podrás ingresar con tu email.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { email: state?.email, otpSent: state?.otpSent } })}
            className="text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            ← Volver al inicio de sesión
          </button>
        </div>
      </div>
    </div>
  );
}
