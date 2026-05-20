import { fetchWithAuth } from "./api";

export async function fetchAppConfig() {
  const res = await fetchWithAuth("/api/app/config", { method: "GET" });
  if (!res.ok) {
    if (res.status === 426) {
      return res.json();
    }
    throw new Error("Failed to fetch app config");
  }
  return res.json();
}
