import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp } from "@/components/ui/help";
import { helpTexts } from "@/lib/helpTexts";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Copy, Check } from "lucide-react";

type ApiKeyRow = {
  id: number;
  name: string;
  prefix: string;
  scopes: string | string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked: number | boolean;
  created_at: string;
  owner: string;
};

type CreateKeyResp = {
  id: number;
  key: string;
  prefix: string;
  scopes: string[];
};

const ALL_SCOPES = ["fetch", "parse", "jobs", "admin"] as const;

export default function ApiKeysPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["fetch", "parse", "jobs"]);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [created, setCreated] = React.useState<CreateKeyResp | null>(null);
  const [copied, setCopied] = React.useState(false);

  const keysQ = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch<ApiKeyRow[]>("/api-keys"),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name, scopes };
      if (expiresAt) body.expires_at = expiresAt;
      return apiFetch<CreateKeyResp>("/api-keys", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (data) => {
      setCreated(data);
      setCopied(false);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean }>(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleCopy = async () => {
    if (!created?.key) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = created.key;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const scopesDisplay = (s: string | string[]) => {
    const arr = Array.isArray(s) ? s : s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
    return arr;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <motion.div whileHover={{ scale: 1.05 }}><Badge variant={isAdmin ? "default" : "destructive"}>{isAdmin ? "admin" : "member"} view</Badge></motion.div>
      </motion.div>
      <PageHelp title={helpTexts.apiKeys.title} description={helpTexts.apiKeys.description} tips={helpTexts.apiKeys.tips} />

      <AnimatePresence>
        {!isAdmin && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-sm text-destructive font-medium">403 — Admin access required. Backend will reject with 403.</div>
                <p className="text-xs text-muted-foreground mt-1">Logged in as {user?.email} ({user?.role}).</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle>Create API key — POST /api/api-keys (admin)</CardTitle>
            <CardDescription>
              Fields: name (unique label), scopes (fetch, parse, jobs, admin), expires_at (datetime-local optional). Raw key shown once only — copy and store securely. Handles 409/422 errors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-service-key" />
              </div>
              <div className="space-y-2">
                <Label>Expires at (optional)</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scopes (multi-select)</Label>
              <div className="flex flex-wrap gap-3">
                {ALL_SCOPES.map((s) => (
                  <motion.label key={s} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 cursor-pointer hover:bg-accent transition-colors">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                    {s}
                  </motion.label>
                ))}
              </div>
              {scopes.length === 0 && <p className="text-xs text-destructive">Select at least one scope.</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name || scopes.length === 0}>
                {createMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create key"}
              </Button>
              <span className="text-xs text-muted-foreground">Server generates cb_… prefix + sha256 hash; audit api_key.create</span>
            </div>
            <AnimatePresence>
              {createMut.error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{String((createMut.error as Error).message)} {(String((createMut.error as Error).message).includes("409") || String((createMut.error as Error).message).toLowerCase().includes("exists")) && " — 409 conflict"}</motion.div>}
              {created && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="border rounded-md p-3 bg-amber-50 dark:bg-amber-950/30 space-y-2">
                  <div className="text-sm font-semibold">Key created — copy now (shown once)</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="bg-muted px-2 py-1 rounded text-xs break-all">{created.key}</code>
                    <Button size="sm" variant="outline" onClick={handleCopy}>
                      {copied ? <><Check className="h-3 w-3 mr-1" /> Copied!</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">Prefix: {created.prefix} · Scopes: {created.scopes.join(", ")} · ID: {created.id}</div>
                  <div className="text-xs text-destructive">Store securely — backend only stores prefix + hash, cannot retrieve again.</div>
                  <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                    Dismiss
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardHeader>
            <CardTitle>All API keys · GET /api/api-keys · DELETE /api-keys/{`{id}`} (revoke)</CardTitle>
            <CardDescription>Table id / name / prefix / scopes / last_used_at / expires_at / revoked / owner · revoke sets revoked=1 and audit api_key.revoke.</CardDescription>
          </CardHeader>
          <CardContent>
            {keysQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
            <AnimatePresence>
              {keysQ.error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-2">{String((keysQ.error as Error).message)}</motion.div>}
              {revokeMut.error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-2">Revoke error: {String((revokeMut.error as Error).message)}</motion.div>}
            </AnimatePresence>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires at</TableHead>
                <TableHead>Revoked</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {keysQ.data?.map((k, idx) => {
                  const revoked = k.revoked === 1 || k.revoked === true;
                  const sc = scopesDisplay(k.scopes);
                  return (
                    <motion.tr key={k.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.04 }} className={`border-b transition-colors hover:bg-muted/50 ${revoked ? "opacity-60" : ""}`}>
                      <TableCell>{k.id}</TableCell>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">{k.prefix}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {sc.map((s) => (
                            <Badge key={s} variant={s === "admin" ? "destructive" : "secondary"} className="text-[10px] transition-transform hover:scale-105">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{k.last_used_at ?? "—"}</TableCell>
                      <TableCell className="text-xs">{k.expires_at ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={revoked ? "destructive" : "outline"}>{revoked ? "revoked" : "active"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{k.owner}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={revoked ? "outline" : "destructive"} disabled={revoked || revokeMut.isPending} onClick={() => revokeMut.mutate(k.id)}>
                          {revokeMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}{revoked ? "Revoked" : "Revoke"}
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {keysQ.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No API keys yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => keysQ.refetch()}>
              {keysQ.isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Refresh
            </Button>
            {keysQ.isFetching && <span className="text-xs text-muted-foreground py-2 animate-pulse">Refreshing…</span>}
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
