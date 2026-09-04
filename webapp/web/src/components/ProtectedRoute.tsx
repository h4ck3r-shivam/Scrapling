import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

export function ProtectedRoute({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) {
  const token = useAuthStore((s) => s.token) ?? localStorage.getItem("cb_token");
  const user = useAuthStore((s) => s.user);
  // hydrate fallback from localStorage for direct reload before zustand hydrate
  const storedUser = (() => {
    if (user) return user;
    try {
      const raw = localStorage.getItem("cb_user");
      return raw ? (JSON.parse(raw) as { email: string; role: string }) : null;
    } catch {
      return null;
    }
  })();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && storedUser?.role !== "admin") return <Navigate to="/jobs" replace />;
  return <>{children}</>;
}
