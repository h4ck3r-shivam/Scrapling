import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useWs } from "@/hooks/useWs";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import { StatusCards } from "@/components/StatusCards";
import type { SystemInfoOut, DiskOut } from "@/lib/types";
import { Download, Play, Square, Copy, RefreshCw, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function bytesPretty(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SystemPage() {
  const qc = useQueryClient();
  const [logs, setLogs] = React.useState<string[]>([]);
  const infoQ = useQuery<SystemInfoOut>({
    queryKey: ["system-info"],
    queryFn: () => apiFetch("/system/info"),
    refetchInterval: 10_000,
  });
  const diskQ = useQuery<DiskOut>({
    queryKey: ["system-disk"],
    queryFn: () => apiFetch("/system/disk"),
    refetchInterval: 10_000,
  });
  const mcpListQ = useQuery<{ processes: Array<{ name: string; port: number; running: boolean }> }>({
    queryKey: ["system-mcp"],
    queryFn: () => apiFetch("/system/mcp"),
    refetchInterval: 5_000,
  });
  const shellHelpQ = useQuery<{ capabilities: string[] }>({
    queryKey: ["shell-help"],
    queryFn: () => apiFetch("/shell/help"),
  });
  const [shellOp, setShellOp] = React.useState("validate_regex");
  const [shellPattern, setShellPattern] = React.useState("^[a-z]+$");
  const [shellInput, setShellInput] = React.useState('{"a": 1}');
  const [shellData, setShellData] = React.useState("contact us at alice@example.com, see https://example.com");
  const [shellOut, setShellOut] = React.useState<unknown>(null);
  const [shellErr, setShellErr] = React.useState<string | null>(null);
  const shellMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { op: shellOp };
      if (shellOp === "validate_regex") body.pattern = shellPattern;
      else if (shellOp === "format_json") body.input = shellInput;
      else body.data = shellData;
      return apiFetch<unknown>("/shell/exec", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (d) => { setShellOut(d); setShellErr(null); },
    onError: (e: unknown) => { setShellErr(e instanceof Error ? e.message : String(e)); setShellOut(null); },
  });

  useWs("/api/ws/system", (data) => {
    const d = data as Record<string, unknown>;
    if (d.type === "install_log" || d.type === "mcp_log") {
      setLogs((prev) =>
        [`${new Date().toLocaleTimeString()}  ${String(d.line ?? "")}`, ...prev].slice(0, 500)
      );
    } else if (d.type === "install_done") {
      setLogs((prev) =>
        [`${new Date().toLocaleTimeString()}  install_done code=${String(d.code)}`, ...prev].slice(0, 500)
      );
      qc.invalidateQueries({ queryKey: ["system-info"] });
    }
  });

  const installMut = useMutation({
    mutationFn: () => apiFetch("/system/install-browsers", { method: "POST" }),
    onSuccess: () => toast.success("Browser install started — watch the log below"),
    onError: (e: unknown) => toast.error(`Install failed: ${String((e as Error).message)}`),
  });
  const mcpStartMut = useMutation({
    mutationFn: () => apiFetch("/system/mcp/start", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast.success("MCP server starting…");
      qc.invalidateQueries({ queryKey: ["system-mcp"] });
    },
    onError: (e: unknown) => toast.error(`MCP start failed: ${String((e as Error).message)}`),
  });
  const mcpStopMut = useMutation({
    mutationFn: () => apiFetch("/system/mcp/stop", { method: "POST", body: JSON.stringify({ name: "default" }) }),
    onSuccess: () => {
      toast.success("MCP server stopping");
      qc.invalidateQueries({ queryKey: ["system-mcp"] });
    },
    onError: (e: unknown) => toast.error(`MCP stop failed: ${String((e as Error).message)}`),
  });

  const totalDisk = diskQ.data
    ? diskQ.data.exports_bytes + diskQ.data.crawls_bytes + diskQ.data.dev_cache_bytes
    : 0;
  const mcpRunning = mcpListQ.data?.processes.filter((p) => p.running) ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold">System</motion.h1>
      <PageHelp title={helpTexts.system.title} description={helpTexts.system.description} tips={helpTexts.system.tips} />

      <StatusCards
        items={[
          {
            label: "Backend version",
            value: infoQ.data?.scrapling_version ?? "—",
            detail: infoQ.data?.app ?? "",
            variant: "neutral",
          },
          {
            label: "Browser deps",
            value: infoQ.data?.dependencies_installed ? "Installed" : "Missing",
            detail: "Patchright / Playwright Chromium",
            variant: infoQ.data?.dependencies_installed ? "ok" : "err",
          },
          {
            label: "Disk usage",
            value: bytesPretty(totalDisk),
            detail: diskQ.data
              ? `Exports ${bytesPretty(diskQ.data.exports_bytes)} · Crawls ${bytesPretty(diskQ.data.crawls_bytes)} · Cache ${bytesPretty(diskQ.data.dev_cache_bytes)}`
              : "Loading…",
            variant: totalDisk > 5 * 1024 ** 3 ? "warn" : "ok",
          },
          {
            label: "MCP server",
            value: mcpRunning.length > 0 ? "Running" : "Stopped",
            detail: mcpRunning.length > 0 ? `${mcpRunning.length} process(es)` : "Launch below",
            variant: mcpRunning.length > 0 ? "ok" : "neutral",
          },
        ]}
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="grid md:grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader>
            <CardTitle>Backend details</CardTitle>
            <CardDescription>Version, Python path, max concurrent jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Engine</dt><dd>{infoQ.data?.scrapling_version ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">App</dt><dd>{infoQ.data?.app ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Python</dt><dd className="font-mono text-xs">{infoQ.data?.python_bin ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Max concurrent jobs</dt><dd>{infoQ.data?.max_concurrent_jobs ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Uptime</dt><dd>{infoQ.data ? `${Math.round(infoQ.data.uptime_seconds)}s` : "—"}</dd></div>
              {infoQ.data?.curl_cffi ? (
                <div className="flex justify-between"><dt className="text-muted-foreground">curl_cffi</dt><dd className="font-mono text-xs">{infoQ.data.curl_cffi}</dd></div>
              ) : null}
            </dl>
          </CardContent>
        </Card></motion.div>
        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader>
            <CardTitle>Disk usage</CardTitle>
            <CardDescription>How much space each Chaan-Been folder uses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {diskQ.data ? (
              <>
                <DiskBar label="Exports" bytes={diskQ.data.exports_bytes} />
                <DiskBar label="Crawls" bytes={diskQ.data.crawls_bytes} />
                <DiskBar label="Dev cache" bytes={diskQ.data.dev_cache_bytes} />
                <DiskBar label="Adaptive DB" bytes={diskQ.data.adaptive_db_bytes} />
                <DiskBar label="App DB" bytes={diskQ.data.db_bytes} />
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            )}
            <Button size="sm" variant="outline" onClick={() => diskQ.refetch()}>
              <RefreshCw className={`h-3 w-3 mr-1 ${diskQ.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </CardContent>
        </Card></motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="grid md:grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader>
            <CardTitle>Install browsers</CardTitle>
            <CardDescription>Downloads Chromium for the dynamic + stealth engines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={() => installMut.mutate()} disabled={installMut.isPending}>
              {installMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Install Chromium
            </Button>
            <AnimatePresence>
              {infoQ.data?.dependencies_installed ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-emerald-600">Already installed — re-run only if you suspect corruption.</motion.p>
              ) : (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-amber-600">Not yet installed — required for any browser engine.</motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card></motion.div>
        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader>
            <CardTitle>MCP server</CardTitle>
            <CardDescription>Run the Chaan-Been MCP server so AI assistants can connect.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Button onClick={() => mcpStartMut.mutate()} disabled={mcpStartMut.isPending}>
                {mcpStartMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Start MCP
              </Button>
              <Button variant="outline" onClick={() => mcpStopMut.mutate()} disabled={mcpStopMut.isPending}>
                {mcpStopMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Square className="h-4 w-4 mr-1" />} Stop
              </Button>
            </div>
            <AnimatePresence>
              {mcpListQ.data?.processes.map((p, idx) => (
                <motion.div key={p.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.05 }} className="flex items-center justify-between border rounded p-2 text-sm hover:bg-muted/30 transition-colors">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Port {p.port}</div>
                  </div>
                  <Badge variant={p.running ? "default" : "outline"} className={p.running ? "animate-pulse" : ""}>{p.running ? "running" : "stopped"}</Badge>
                </motion.div>
              ))}
            </AnimatePresence>
            {mcpListQ.data?.processes.length === 0 && (
              <div className="text-xs text-muted-foreground">No MCP processes. Click Start to launch one.</div>
            )}
          </CardContent>
        </Card></motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1">Shell tools — admin only <InfoTooltip content="Safe admin helpers: validate regex, pretty-print JSON, extract emails/URLs. Calls GET /shell/help + POST /shell/exec." /></CardTitle>
            <CardDescription>Capabilities from GET /shell/help. Run one op at a time via POST /shell/exec.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shellHelpQ.isError && <div className="text-xs text-muted-foreground">Capabilities unavailable (admin only): {shellHelpQ.error instanceof Error ? shellHelpQ.error.message : String(shellHelpQ.error)}</div>}
            {shellHelpQ.data && (
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                {shellHelpQ.data.capabilities.map((c, i) => <li key={i} className="font-mono">{c}</li>)}
              </ul>
            )}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-2"><div className="flex items-center gap-1"><Label>Op</Label><InfoTooltip content="validate_regex needs pattern; format_json needs input; extract_* need data." /></div>
                <Select value={shellOp} onChange={(e) => setShellOp(e.target.value)}>
                  <option value="validate_regex">validate_regex</option>
                  <option value="format_json">format_json</option>
                  <option value="extract_emails">extract_emails</option>
                  <option value="extract_urls">extract_urls</option>
                </Select>
                <FieldHelp>Admin only — each run is audit-logged.</FieldHelp>
              </div>
              {shellOp === "validate_regex" && <div className="space-y-2 md:col-span-2"><div className="flex items-center gap-1"><Label>Pattern</Label><InfoTooltip content="Regex to compile, e.g. ^[a-z]+$" /></div><Input value={shellPattern} onChange={(e) => setShellPattern(e.target.value)} placeholder="^[a-z]+$" /></div>}
              {shellOp === "format_json" && <div className="space-y-2 md:col-span-2"><div className="flex items-center gap-1"><Label>Input JSON</Label><InfoTooltip content="Raw JSON to pretty-print." /></div><Textarea value={shellInput} onChange={(e) => setShellInput(e.target.value)} rows={4} /></div>}
              {(shellOp === "extract_emails" || shellOp === "extract_urls") && <div className="space-y-2 md:col-span-2"><div className="flex items-center gap-1"><Label>Data (text to scan)</Label><InfoTooltip content="Free text — emails or http(s) URLs are pulled out." /></div><Textarea value={shellData} onChange={(e) => setShellData(e.target.value)} rows={4} /></div>}
            </div>
            <Button size="sm" onClick={() => shellMut.mutate()} disabled={shellMut.isPending}>{shellMut.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running…</> : "Run op"}</Button>
            {shellErr && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{shellErr}</div>}
            {shellOut != null && (
              <div className="space-y-1">
                <Label>Result — valid / error / formatted</Label>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[240px]">{JSON.stringify(shellOut, null, 2)}</pre>
                <FieldHelp>valid=true means the op succeeded; formatted/result carry the output when present.</FieldHelp>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">System event log {logs.length > 0 && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}</CardTitle>
            <CardDescription>Live stream of install_browsers and MCP output via WebSocket.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] overflow-auto border rounded p-2 font-mono text-xs bg-muted/20 space-y-1">
              <AnimatePresence initial={false}>
                {logs.map((l, i) => <motion.div key={`${i}-${l.slice(0,20)}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="truncate">{l}</motion.div>)}
              </AnimatePresence>
              {!logs.length && <span className="text-muted-foreground">No system events yet.</span>}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function DiskBar({ label, bytes }: { label: string; bytes: number }) {
  // Scale to 1 GB for the bar
  const pct = Math.min(100, (bytes / (1024 ** 3)) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">{bytesPretty(bytes)}</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-primary"
        />
      </div>
    </div>
  );
}
