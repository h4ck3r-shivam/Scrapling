import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp } from "@/components/ui/help";
import { helpTexts } from "@/lib/helpTexts";
import { RecordSheet } from "@/components/RecordSheet";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

type AuditRow = {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail_json: string | null;
  at: string;
};

export default function AuditPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const [limit, setLimit] = React.useState(200);
  const [filter, setFilter] = React.useState("");
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [viewing, setViewing] = React.useState<AuditRow | null>(null);

  const auditQ = useQuery({
    queryKey: ["audit", limit],
    queryFn: () => apiFetch<AuditRow[]>(`/audit?limit=${limit}`),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const filtered = React.useMemo(() => {
    if (!auditQ.data) return [];
    if (!filter.trim()) return auditQ.data;
    const f = filter.trim().toLowerCase();
    return auditQ.data.filter((r) => r.action.toLowerCase().includes(f));
  }, [auditQ.data, filter]);

  const distinctActions = React.useMemo(() => {
    if (!auditQ.data) return [];
    const s = new Set(auditQ.data.map((r) => r.action));
    return Array.from(s).sort();
  }, [auditQ.data]);

  const formatDetail = (d: string | null) => {
    if (!d) return "—";
    try {
      const j = JSON.parse(d);
      return JSON.stringify(j);
    } catch {
      return d;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <motion.div whileHover={{ scale: 1.05 }}><Badge variant={isAdmin ? "default" : "destructive"}>{isAdmin ? "admin" : "member"} view</Badge></motion.div>
      </motion.div>
      <PageHelp title={helpTexts.audit.title} description={helpTexts.audit.description} tips={helpTexts.audit.tips} />

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
            <CardTitle className="flex items-center gap-2">GET /api/audit?limit={limit} · auto-refresh {autoRefresh ? "10s" : "off"} · filter by action {auditQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}</CardTitle>
            <CardDescription>Table id / actor / action / target / detail_json / at · audit_log ordered DESC. Filters client-side by action substring. Limit controls server-side SELECT LIMIT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label>Limit</Label>
                <Select value={String(limit)} onChange={(e) => setLimit(parseInt(e.target.value, 10))}>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Filter by action (substring, e.g. user.create, fetch, login)</Label>
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter action…" list="audit-actions" />
                <datalist id="audit-actions">
                  {distinctActions.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> auto-refresh
                </label>
                <Button size="sm" variant="outline" onClick={() => auditQ.refetch()}>
                  {auditQ.isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Refresh
                </Button>
              </div>
            </div>

            {auditQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
            <AnimatePresence>{auditQ.error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{String((auditQ.error as Error).message)}</motion.div>}</AnimatePresence>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Showing {filtered.length} / {auditQ.data?.length ?? 0} rows · distinct actions: {distinctActions.join(", ") || "—"}
              </span>
              {auditQ.isFetching && <span className="animate-pulse inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> refreshing…</span>}
            </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filtered.map((r, idx) => (
                  <motion.tr key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.4) }} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="text-xs">{r.actor}</TableCell>
                    <TableCell>
                      <Badge
                        className="transition-transform hover:scale-105"
                        variant={
                          r.action.startsWith("user.")
                            ? "default"
                            : r.action.startsWith("api_key.")
                              ? "secondary"
                              : r.action === "login"
                                ? "outline"
                                : r.action.startsWith("job.")
                                  ? "default"
                                  : "secondary"
                        }
                      >
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]" title={r.target}>
                      {r.target || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <button
                        className="truncate max-w-[260px] block text-left hover:text-foreground hover:underline"
                        title="Click to view the full details"
                        onClick={() => setViewing(r)}
                      >
                        {formatDetail(r.detail_json).slice(0, 300)}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.at}</TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && !auditQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No audit entries{filter ? ` matching "${filter}"` : ""}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <RecordSheet
            open={!!viewing}
            onClose={() => setViewing(null)}
            title={viewing ? `Entry #${viewing.id} — ${viewing.action}` : "Entry details"}
            subtitle={viewing ? `${viewing.actor} · ${viewing.at}` : undefined}
            record={
              viewing
                ? {
                    actor: viewing.actor,
                    action: viewing.action,
                    target: viewing.target || "—",
                    at: viewing.at,
                    detail: (() => {
                      try {
                        return viewing.detail_json ? JSON.parse(viewing.detail_json) : "—";
                      } catch {
                        return viewing.detail_json || "—";
                      }
                    })(),
                  }
                : null
            }
          />
          <p className="text-xs text-muted-foreground">Tip: click any detail cell to read it fully — no need to guess from the truncated text. Actions include login, user.create, user.update, api_key.create, api_key.revoke, fetch, job.start.</p>
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
