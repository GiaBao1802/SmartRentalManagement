import { apiRequest } from "./apiClient";
export const credentialApi = {
  inspect: (purpose: "invitation" | "reset", token: string) => apiRequest<{ valid: true; expires_at: string }>("/auth/credential-link/inspect", { method: "POST", authRequired: false, body: JSON.stringify({ purpose, token }) }),
  accept: (token: string, password: string) => apiRequest<{ accepted: boolean }>("/auth/accept-invitation", { method: "POST", authRequired: false, body: JSON.stringify({ token, password }) }),
  reset: (token: string, password: string) => apiRequest<{ reset: boolean }>("/auth/reset-password", { method: "POST", authRequired: false, body: JSON.stringify({ token, password }) }),
  forgot: (login: string) => apiRequest<{ requested: boolean }>("/auth/forgot-password", { method: "POST", authRequired: false, body: JSON.stringify({ login }) }),
};
