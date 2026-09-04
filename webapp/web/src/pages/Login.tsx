import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/api";
import { Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FirstRunHint } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<FirstRunHint | null>(null);
  const [showHint, setShowHint] = React.useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  React.useEffect(() => {
    apiFetch<FirstRunHint>("/auth/first-run-hint").then(setHint).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ access_token: string; refresh_token?: string | null; user: { email: string; role: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth(data.access_token, data.user, data.refresh_token ?? null);
      // Acknowledge the first-run hint so it stops showing on next login
      if (hint?.hint) {
        apiFetch("/auth/dismiss-first-run", { method: "POST" }).catch(() => {});
      }
      navigate("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function copyHintPassword() {
    if (!hint?.password) return;
    navigator.clipboard.writeText(hint.password).then(
      () => toast.success("Password copied to clipboard"),
      () => toast.error("Could not copy — please write it down manually")
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="w-full max-w-md space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <PageHelp
            title="Welcome to Chaan-Been"
            description="Log in to manage crawls, fetch pages, and view results. Your team can run jobs without writing code."
            tips={[
              "First time? See the box below for the auto-generated admin password.",
              "Your login gives you a JWT token (stored in your browser) — it’s sent automatically with every request.",
              "Members can run jobs but need admin to create users or proxies.",
            ]}
          />
        </motion.div>

        <AnimatePresence>
          {hint?.hint && (
            <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: 0.15 }}>
              <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <motion.span initial={{ rotate: -10 }} animate={{ rotate: 0 }} transition={{ type: "spring", stiffness: 300 }}><KeyRound className="h-4 w-4" /></motion.span> First-run admin password
                  </CardTitle>
                  <CardDescription className="text-xs">
                    The server generated a random password on its first launch. Copy it now — it’s only shown once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <AnimatePresence mode="wait">
                    {showHint ? (
                      <motion.div key="show" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-muted rounded font-mono text-sm break-all">
                          {hint.password}
                        </code>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button size="sm" variant="outline" onClick={copyHintPassword}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </motion.div>
                      </motion.div>
                    ) : (
                      <motion.div key="hide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setShowHint(true)}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Show password
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground">
                    Default admin email: <code>admin@example.com</code> (or whatever <code>SCC_ADMIN_EMAIL</code> is set to).
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} whileHover={{ y: -1 }} className="w-full max-w-md">
          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                Enter your team email and password. New here? Ask an admin to create your account under Users.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Email</Label>
                    <InfoTooltip content="Your team login email — e.g., alice@example.com. Ask your admin to create it under Users if you don’t have one." />
                  </div>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Password</Label>
                    <InfoTooltip content="Your secret password — never share. Admins can reset it under Users if you forget it." />
                  </div>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      <motion.span whileTap={{ scale: 0.85 }} className="inline-flex">
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </motion.span>
                    </Button>
                  </div>
                  <FieldHelp>Change your password immediately after your first login (Users page).</FieldHelp>
                </div>
                <AnimatePresence>
                  {err && (
                    <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {err} — check your email/password or ask admin if your account is disabled.
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...</> : "Sign in"}
                  </Button>
                </motion.div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
