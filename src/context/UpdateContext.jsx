import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const UpdateContext = createContext(null);

export const UpdateProvider = ({ children }) => {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const lastStatusRef = useRef("idle");

  useEffect(() => {
    if (!window.updater?.onUpdateEvent) return;
    const handleEvent = (event) => {
      if (!event?.status) return;
      if (event.status === lastStatusRef.current && event.status !== "downloading") {
        return;
      }
      lastStatusRef.current = event.status;

      switch (event.status) {
        case "checking":
          setStatus("checking");
          setError(null);
          break;
        case "available":
          setStatus("available");
          setError(null);
          break;
        case "downloading":
          setStatus("downloading");
          setProgress(Number(event.percent) || 0);
          setError(null);
          break;
        case "downloaded":
          setStatus("downloaded");
          setError(null);
          break;
        case "error": {
          const raw = event.message || "Error desconocido";
          let friendly = "No se pudo actualizar. Intentá nuevamente."
          if (typeof raw === "string") {
            if (raw.includes("beta.yml") || raw.includes("latest.yml")) {
              friendly = "No se encontró una versión publicada para tu canal."
            } else if (raw.includes("403") || raw.includes("401")) {
              friendly = "No se pudo acceder al servidor de actualizaciones."
            } else if (raw.toLowerCase().includes("network") || raw.toLowerCase().includes("fetch")) {
              friendly = "No hay conexión con el servidor de actualizaciones."
            }
          }
          setStatus("error");
          setError(friendly);
          break;
        }
        default:
          setStatus("idle");
          break;
      }
    };

    window.updater.onUpdateEvent(handleEvent);
  }, []);

  const value = useMemo(
    () => ({
      status,
      progress,
      error,
      checkForUpdates: window.updater?.checkForUpdates,
      forceCheck: window.updater?.forceCheck,
      downloadUpdate: window.updater?.downloadUpdate,
      installUpdate: window.updater?.installUpdate,
    }),
    [status, progress, error]
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
};

export const useUpdater = () => {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    return {
      status: "idle",
      progress: 0,
      error: null,
      checkForUpdates: () => {},
      forceCheck: () => {},
      downloadUpdate: () => {},
      installUpdate: () => {},
    };
  }
  return ctx;
};
