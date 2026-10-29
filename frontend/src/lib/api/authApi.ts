import { apiRequest } from "./apiClient";

export type Role = "admin" | "resident" | "superadmin";
export type AuthUser = {
  account: { account_id: string; role: Role; email: string | null; phone: string | null; status: "active" };
  profile: { owner_id: string; display_name: string } | { resident_id: string; full_name: string } | { display_name: string };
};
type LoginResponse = AuthUser & { expires_at: string };

export const authApi = {
  async login(login: string, password: string): Promise<AuthUser> {
    const result = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST", authRequired: false, body: JSON.stringify({ login, password }),
    });
    return { account: result.account, profile: result.profile };
  },
  me: () => apiRequest<AuthUser>("/auth/me"),
  logout: () => apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST" }),
};

export function displayName(user: AuthUser): string {
  return "display_name" in user.profile ? user.profile.display_name : user.profile.full_name;
}
