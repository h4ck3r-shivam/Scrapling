import { create } from "zustand";

type User = { email: string; role: string };

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User, refreshToken?: string | null) => void;
  logout: () => void;
  hydrate: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user, refreshToken) => {
    localStorage.setItem("cb_token", token);
    localStorage.setItem("cb_user", JSON.stringify(user));
    if (refreshToken) localStorage.setItem("cb_refresh_token", refreshToken);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("cb_token");
    localStorage.removeItem("cb_user");
    localStorage.removeItem("cb_refresh_token");
    set({ token: null, user: null });
  },
  hydrate: () => {
    const t = localStorage.getItem("cb_token");
    const u = localStorage.getItem("cb_user");
    if (t && u) {
      try {
        const parsed = JSON.parse(u) as User;
        set({ token: t, user: parsed });
        // async validate with backend GET /auth/me (covers role changes / token expiry)
        // fire-and-forget; 401 will be handled by apiFetch and clear storage
        import("@/lib/api").then(({ apiFetch }) => {
          apiFetch<{ email: string; role: string }>("/auth/me")
            .then((fresh) => {
              // sync fresh role from backend (authoritative)
              if (fresh.email !== parsed.email || fresh.role !== parsed.role) {
                localStorage.setItem("cb_user", JSON.stringify(fresh));
                set({ token: t, user: fresh });
              }
            })
            .catch(() => {
              // ignore network; apiFetch already handles 401 redirect
            });
        });
      } catch {
        localStorage.removeItem("cb_token");
        localStorage.removeItem("cb_user");
        localStorage.removeItem("cb_refresh_token");
      }
    } else if (t && !u) {
      // token without user (e.g., manual localStorage): validate via /auth/me
      import("@/lib/api").then(({ apiFetch }) => {
        apiFetch<{ email: string; role: string }>("/auth/me")
          .then((fresh) => {
            localStorage.setItem("cb_user", JSON.stringify(fresh));
            set({ token: t, user: fresh });
          })
          .catch(() => {
            // invalid token → apiFetch 401 handler clears; ensure state cleared
            localStorage.removeItem("cb_token");
            localStorage.removeItem("cb_user");
            localStorage.removeItem("cb_refresh_token");
            set({ token: null, user: null });
          });
      });
    }
  },
}));
