import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function SessionsPage() {
  const qc = useQueryClient();
  const [name, setName] = React.useState("sess-1");
  const [kind, setKind] = React.useState<"static" | "dynamic" | "stealth">("static");
  const [cfgJson, setCfgJson] = React.useState('{}');
  const [cfgTouched, setCfgTouched] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const defaultCfgFor = (k: "static" | "dynamic" | "stealth") =>
    k === "static" ? '{}' : '{\n  "headless": true\n}';

  const handleKindChange = (k: "static" | "dynamic" | "stealth") => {
    setKind(k);
    if (!cfgTouched) setCfgJson(defaultCfgFor(k));
  };
  const [histLimit, setHistLimit] = React.useState("50");
  const [detailName, setDetailName] = React.useState<string | null>(null);

  const q = useQuery({ queryKey: ["sessions"], queryFn: () => apiFetch<Record<string, unknown>[]>("/sessions"), refetchInterval: 4000 });
  const histQ = useQuery({
    queryKey: ["sessions-history", histLimit],
    queryFn: () => apiFetch<Record<string, unknown>[]>(`/sessions/history?limit=${encodeURIComponent(histLimit || "50")}`),
  });
  const detailQ = useQuery({
    queryKey: ["session-detail", detailName],
    queryFn: () => apiFetch<Record<string, unknown>>(`/sessions/${encodeURIComponent(detailName!)}`),
    enabled: !!detailName,
  });

  const openMut = useMutation({
    mutationFn: async () => {
      let cfg: Record<string, unknown> = {};
      try { cfg = cfgJson.trim() ? JSON.parse(cfgJson) : {}; } catch (e) { throw new Error("JSON invalid: " + String(e)); }
      const payload: Record<string, unknown> = { name, kind };
      if (kind === "static") payload.static_config = cfg;
      else if (kind === "dynamic") payload.dynamic_config = cfg;
      else payload.stealth_config = cfg;
      return apiFetch("/sessions/open", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ["sessions"] }); qc.invalidateQueries({ queryKey: ["sessions-history"] }); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const closeMut = useMutation({
    mutationFn: (n: string) => apiFetch(`/sessions/${n}/close`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); qc.invalidateQueries({ queryKey: ["sessions-history"] }); },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-5xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold">Sessions</motion.h1>
      <PageHelp title={helpTexts.sessions.title} description={helpTexts.sessions.description} tips={helpTexts.sessions.tips} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader><CardTitle>Open session — POST /sessions/open</CardTitle><CardDescription>Keep a browser/HTTP pool warm between requests – reuse login & avoid startup cost. Managed in-process by session_manager.py</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2"><div className="flex items-center gap-1"><Label>Name</Label><InfoTooltip content={helpTexts.sessions.fields.name} /></div><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="sess-1" /><FieldHelp>{helpTexts.sessions.fields.name}</FieldHelp></div>
              <div className="space-y-2"><div className="flex items-center gap-1"><Label>Kind</Label><InfoTooltip content={helpTexts.sessions.fields.kind} /></div><Select value={kind} onChange={(e) => handleKindChange(e.target.value as never)}><option value="static">static</option><option value="dynamic">dynamic</option><option value="stealth">stealth</option></Select><FieldHelp>{helpTexts.sessions.fields.kind}</FieldHelp></div>
              <div className="flex items-end"><Button onClick={() => openMut.mutate()} disabled={openMut.isPending}>{openMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening…</> : "Open"}</Button></div>
            </div>
            <div className="space-y-2"><div className="flex items-center gap-1"><Label>Config JSON</Label><InfoTooltip content={helpTexts.sessions.fields.config} /></div>
            <div className="border rounded overflow-hidden transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring" style={{ height: 180 }}><Editor height="180px" language="json" value={cfgJson} onChange={(v) => { setCfgJson(v || "{}"); setCfgTouched(true); }} options={{ minimap: { enabled: false } }} /></div><FieldHelp>Static: impersonate, timeout, retries (e.g. {}). Browser: headless, block_ads, disable_resources, cookies, extra_headers, proxy_group_id, captcha, etc. – see Fetch Browser config for all keys. Use headless:true for prod.</FieldHelp></div>
            <AnimatePresence>{err && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</motion.div>}</AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardHeader><CardTitle>Live sessions — GET /sessions (poll 4s) · pool_stats {q.isFetching && <Loader2 className="h-3 w-3 animate-spin inline-block ml-2 text-muted-foreground" />}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>Pool stats</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                <AnimatePresence>
                  {(q.data as unknown[])?.map((r: unknown, idx: number) => {
                    const row = r as Record<string, unknown>;
                    const nm = String(row.name ?? row.id);
                    return <motion.tr key={nm} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.03 }} className="border-b transition-colors hover:bg-muted/50"><TableCell><button className="underline underline-offset-2 hover:text-primary" title="View detail (GET /sessions/{name})" onClick={() => setDetailName(nm)}>{nm}</button></TableCell><TableCell>{String(row.kind ?? row.state ?? "")}</TableCell><TableCell className="font-mono text-xs truncate max-w-[360px]">{JSON.stringify(row.pool_stats ?? row.pool_stats_json ?? row)}</TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDetailName(nm)}>Detail</Button><Button size="sm" variant="outline" onClick={() => closeMut.mutate(nm)} disabled={closeMut.isPending}>{closeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Close"}</Button></div></TableCell></motion.tr>;
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
            {!q.data?.length && <div className="text-sm text-muted-foreground mt-2">No live sessions. Managed by session_manager.py in-process.</div>}
            <FieldHelp>Click a session name for stored detail (GET /sessions/{"{name}"}).</FieldHelp>
            {detailName && (
              <div className="mt-3 border rounded p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-1">Session detail — {detailName} <InfoTooltip content="Stored row from DB (spec, state, pool stats). Fetched via GET /sessions/{name}." /></div>
                  <Button size="sm" variant="ghost" onClick={() => setDetailName(null)}>Close</Button>
                </div>
                {detailQ.isLoading ? <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
                : detailQ.isError ? <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{detailQ.error instanceof Error ? detailQ.error.message : String(detailQ.error)}</div>
                : detailQ.data ? <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[260px]">{JSON.stringify(detailQ.data, null, 2)}</pre> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1">Session history — GET /sessions/history <InfoTooltip content="Every session ever opened, stored in the DB (open + closed). Newest first." /></CardTitle><CardDescription>Persisted rows from the sessions table, including closed sessions.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Limit</Label>
              <Input value={histLimit} onChange={(e) => setHistLimit(e.target.value)} className="max-w-[100px]" placeholder="50" />
              <Button size="sm" variant="outline" onClick={() => histQ.refetch()} disabled={histQ.isFetching}>{histQ.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>State</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {histQ.data?.map((r, idx) => {
                  const row = r as Record<string, unknown>;
                  const nm = String(row.name ?? "");
                  return <tr key={String(row.id ?? idx)} className="border-b hover:bg-muted/50"><TableCell>{String(row.id ?? "")}</TableCell><TableCell><button className="underline underline-offset-2 hover:text-primary" onClick={() => setDetailName(nm)}>{nm}</button></TableCell><TableCell>{String(row.kind ?? "")}</TableCell><TableCell>{String(row.state ?? "")}</TableCell><TableCell className="text-xs text-muted-foreground">{String(row.created_at ?? "")}</TableCell></tr>;
                })}
              </TableBody>
            </Table>
            {!histQ.data?.length && !histQ.isLoading && <div className="text-sm text-muted-foreground">No session history yet — open a session above.</div>}
            {histQ.isError && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{histQ.error instanceof Error ? histQ.error.message : String(histQ.error)}</div>}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
