import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadExport } from "@/lib/api";
import type { Job, JobRun } from "@/lib/api";
import * as React from "react";
import { useWs } from "@/hooks/useWs";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { ResultsTable } from "@/components/ResultsTable";
import { humanizeRunEvent } from "@/lib/humanize";

export default function JobDetail() {
  const { id } = useParams();
  const jobId = Number(id);
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = React.useState("");
  const [liveItems, setLiveItems] = React.useState<unknown[]>([]);
  const [events, setEvents] = React.useState<string[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<number | null>(null);
  const [runDeleteError, setRunDeleteError] = React.useState<string | null>(null);
  const [csvNote, setCsvNote] = React.useState<string | null>(null);

  const { data: jobs, isLoading: jobsLoading } = useQuery({ queryKey: ["jobs"], queryFn: () => apiFetch<Job[]>("/jobs") });
  const job = jobs?.find((j) => j.id === jobId);

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["runs", jobId],
    queryFn: () => apiFetch<JobRun[]>(`/runs?job_id=${jobId}`),
    refetchInterval: 4000,
  });

  const activeRunId = selectedRun ?? runs?.find((r) => r.status === "running")?.id ?? runs?.[0]?.id ?? null;

  const { data: runDetail, isLoading: runDetailLoading } = useQuery({
    queryKey: ["run", activeRunId],
    queryFn: () => apiFetch<JobRun & { files: { format: string; path: string }[] }>(`/runs/${activeRunId}`),
    enabled: !!activeRunId,
  });

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ["results", activeRunId, q],
    queryFn: () => apiFetch<{ total: number; items: { idx: number; item: unknown }[] }>(`/runs/${activeRunId}/results?limit=1000&q=${encodeURIComponent(q)}`),
    enabled: !!activeRunId,
  });

  const startMut = useMutation({ mutationFn: () => apiFetch(`/jobs/${jobId}/start`, { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }) });
  const pauseMut = useMutation({ mutationFn: () => apiFetch(`/jobs/${jobId}/pause`, { method: "POST" }) });
  const cancelMut = useMutation({ mutationFn: () => apiFetch(`/jobs/${jobId}/cancel`, { method: "POST" }) });
  const resumeMut = useMutation({
    mutationFn: () => apiFetch<{ run_id: number }>(`/jobs/${jobId}/resume`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", jobId] }),
  });
  const [cron, setCron] = React.useState("");
  const [schedMsg, setSchedMsg] = React.useState<string | null>(null);
  const schedQ = useQuery({
    queryKey: ["schedule", jobId],
    queryFn: () => apiFetch<{ job_id: number; schedule_cron: string | null; next_run_at: string | null }>(`/jobs/${jobId}/schedule`),
  });
  React.useEffect(() => {
    if (schedQ.data?.schedule_cron) setCron(schedQ.data.schedule_cron);
  }, [schedQ.data?.schedule_cron]);
  const schedMut = useMutation({
    mutationFn: (cronVal: string | null) =>
      apiFetch<{ job_id: number; schedule_cron: string | null; next_run_at: string | null }>(`/jobs/${jobId}/schedule`, {
        method: "POST",
        body: JSON.stringify({ cron: cronVal }),
      }),
    onSuccess: (d) => {
      setSchedMsg(d.schedule_cron ? `Saved — next run ${d.next_run_at ?? "scheduled"}` : "Schedule cleared");
      qc.invalidateQueries({ queryKey: ["schedule", jobId] });
    },
    onError: (e: unknown) => setSchedMsg(e instanceof Error ? e.message : String(e)),
  });

  const csvMut = useMutation({
    mutationFn: async () => {
      if (!activeRunId) throw new Error("Pick a collection first");
      setCsvNote("Preparing your spreadsheet…");
      await apiFetch(`/exports/run/${activeRunId}`, { method: "POST", body: JSON.stringify({ format: "csv" }) });
      await downloadExport(activeRunId, "csv");
      return true;
    },
    onSuccess: () => {
      setCsvNote("Downloaded! Check your downloads folder.");
      qc.invalidateQueries({ queryKey: ["run", activeRunId] });
    },
    onError: (e: unknown) => setCsvNote(e instanceof Error ? e.message : String(e)),
  });

  const deleteRunMut = useMutation({
    mutationFn: (runId: number) => apiFetch(`/runs/${runId}`, { method: "DELETE" }),
    onSuccess: (_data, runId) => {
      setRunDeleteError(null);
      qc.invalidateQueries({ queryKey: ["runs", jobId] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["run"] });
      if (selectedRun === runId) setSelectedRun(null);
      setEvents((prev) => [`Deleted collection #${runId}`, ...prev].slice(0, 100));
    },
    onError: (e: unknown) => setRunDeleteError(e instanceof Error ? e.message : String(e)),
  });

  useWs(activeRunId ? `/api/ws/jobs/${activeRunId}` : null, (data) => {
    const d = data as Record<string, unknown>;
    const human = humanizeRunEvent(d && typeof d === "object" ? d : {});
    setEvents((prev) => [`${new Date().toLocaleTimeString()} — ${human}`, ...prev].slice(0, 100));
    if (d && (d.type === "item" || d.item)) setLiveItems((prev) => [d.item ?? d, ...prev].slice(0, 2000));
    if (d && (d as { type?: string }).type === "done") qc.invalidateQueries({ queryKey: ["runs"] });
  });

  // Expand per-page array results (e.g., {title:[...10], author:[...10]}) into per-item rows for sales view
  function expandRows(raw: { idx: number; item: unknown }[]): { idx: number; item: unknown }[] {
    const expanded: { idx: number; item: unknown }[] = [];
    for (const row of raw) {
      const item = row.item as Record<string, unknown>;
      if (!item || typeof item !== "object") { expanded.push(row); continue; }
      const arrayFields: Record<string, unknown[]> = {};
      let maxLen = 0;
      let hasArray = false;
      for (const [k, v] of Object.entries(item)) {
        if (Array.isArray(v) && v.length > 0 && v.every(x => typeof x === "string" || typeof x === "number")) {
          arrayFields[k] = v as unknown[];
          maxLen = Math.max(maxLen, (v as unknown[]).length);
          hasArray = true;
        }
      }
      if (hasArray && maxLen > 1 && Object.values(arrayFields).every(arr => arr.length === maxLen || arr.length === 1)) {
        for (let i = 0; i < maxLen; i++) {
          const newItem: Record<string, unknown> = { ...item };
          for (const [k, arr] of Object.entries(arrayFields)) {
            newItem[k] = arr.length === maxLen ? arr[i] : arr[0];
          }
          expanded.push({ idx: expanded.length, item: newItem });
        }
      } else {
        expanded.push(row);
      }
    }
    return expanded;
  }

  const items = resultsData?.items ?? [];
  const displayRowsRaw = liveItems.length ? liveItems.map((it, idx) => ({ idx, item: it })) : items;
  const displayRows = expandRows(displayRowsRaw);
  const isExpanded = displayRows.length !== displayRowsRaw.length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <PageHelp title="Your list — call & WhatsApp in 1 click" description="This page shows everything we collected for you. Each row is one company. Copy the phone or tap WhatsApp, then download the spreadsheet." tips={["Press Start, watch live progress in plain words, then Download spreadsheet.", "Use search to filter (e.g. Nairobi).", "Phone column has Copy + WhatsApp per row."]} />
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">List #{jobId} — {job?.name ?? "…"}</h1>
        {job && <Badge variant="secondary">{job.engine} · {job.template}</Badge>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => startMut.mutate()}>Start</Button>
          <Button size="sm" variant="secondary" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending} title="Resume from checkpoint (POST /jobs/{id}/resume)">{resumeMut.isPending ? "Resuming…" : "Resume"}</Button>
          <Button size="sm" variant="secondary" onClick={() => pauseMut.mutate()}>Pause</Button>
          <Button size="sm" variant="destructive" onClick={() => cancelMut.mutate()}>Cancel</Button>
          <Link to={`/jobs/${jobId}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>
        </div>
      </motion.div>
      {(resumeMut.isError || resumeMut.isSuccess) && (
        <div className={`text-xs p-2 rounded ${resumeMut.isError ? "text-destructive bg-destructive/10" : "text-emerald-700 bg-emerald-50"}`}>
          {resumeMut.isError ? (resumeMut.error instanceof Error ? resumeMut.error.message : String(resumeMut.error)) : `Resumed — run #${(resumeMut.data as { run_id: number }).run_id}`}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-1">Previous collections <InfoTooltip content="Each collection is one run of this list. Pick one to see its results." /></CardTitle>
            {activeRunId && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!isAdmin || deleteRunMut.isPending} title={isAdmin ? "Delete run (admin only)" : "Admin only"} onClick={() => { if (!confirm(`Delete collection #${activeRunId}? This removes results & files.`)) return; deleteRunMut.mutate(activeRunId); }}>{deleteRunMut.isPending ? "Deleting…" : "Delete"}</Button><Link to="/runs"><Button size="sm" variant="ghost">All →</Button></Link></div>}
          </CardHeader>
          <CardContent className="space-y-2">
            {runsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <SkeletonTable rows={2} cols={3} />
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <AnimatePresence>
                  {runs?.map((r, idx) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ delay: idx * 0.04, duration: 0.25 }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex items-center gap-1 rounded border text-sm ${activeRunId === r.id ? "bg-accent" : "bg-card"}`}
                    >
                      <button onClick={() => setSelectedRun(r.id)} className="px-3 py-1 text-sm">
                        #{r.id} · {r.status} · {r.items_count} rows
                      </button>
                      <button
                        title={isAdmin ? "Delete" : "Admin only"}
                        disabled={!isAdmin}
                        onClick={() => { if (!confirm(`Delete collection #${r.id}?`)) return; deleteRunMut.mutate(r.id); }}
                        className={`px-2 py-1 text-xs border-l ${isAdmin ? "hover:bg-destructive hover:text-destructive-foreground" : "opacity-40 cursor-not-allowed"}`}
                      >
                        ✕
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!runs?.length && <span className="text-sm text-muted-foreground">No collections yet — hit Start.</span>}
              </div>
            )}
            {jobsLoading && <Skeleton className="h-6 w-1/2 mt-2" />}
            {runDeleteError && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{runDeleteError}</div>}
            {!isAdmin && <div className="text-xs text-muted-foreground">Deleting needs an admin account.</div>}
            {runDetailLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : runDetail ? (
              <div className="text-xs text-muted-foreground space-y-1 border rounded p-2 bg-muted/20">
                <div>Collection #{runDetail.id} · {runDetail.status} · {runDetail.items_count} rows {runDetail.error ? `· needs attention: ${runDetail.error.slice(0, 120)}` : ""}</div>
                <div>Files ready: {runDetail.files?.map((f) => f.format).join(", ") || "none yet — press Download below"}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="results">
        <TabsList><TabsTrigger value="results">Your list</TabsTrigger><TabsTrigger value="live">Live progress</TabsTrigger><TabsTrigger value="exports">Download</TabsTrigger><TabsTrigger value="schedule">Schedule</TabsTrigger></TabsList>

        <TabsContent value="results">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="flex-1 flex items-center gap-1">Your list — ready to call <InfoTooltip content="Columns come from your fields. Each row is one company." /></CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <Input placeholder="e.g. Nairobi, insurance" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-[260px]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Button size="sm" onClick={() => csvMut.mutate()} disabled={!activeRunId || csvMut.isPending}>
                  {csvMut.isPending ? "Preparing…" : "⬇ Download spreadsheet (CSV)"}
                </Button>
                <InfoTooltip content="One click: we prepare the CSV and download it. No extra steps." />
                {csvNote && <span className="text-xs text-muted-foreground">{csvNote}</span>}
                <span className="text-xs text-muted-foreground ml-auto">Total {resultsData?.total ?? 0} · showing {displayRows.length}{isExpanded ? " (expanded for easy calling)" : ""}</span>
              </div>
              <FieldHelp>Tip: use search to narrow down, then Copy phone or tap WhatsApp per row.</FieldHelp>
              {resultsLoading ? (
                <SkeletonTable rows={5} cols={4} />
              ) : (
                <ResultsTable rows={displayRows} />
              )}
              {isExpanded && <div className="text-xs text-muted-foreground mt-2">We split grouped results into one row per company so calling is easy.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1">Live progress — plain words <InfoTooltip content="We turn technical updates into simple sentences." /></CardTitle></CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">Watching {activeRunId ? `collection #${activeRunId}` : "— pick a collection"} · {events.length} updates · {liveItems.length} new rows</div>
              <div className="h-[420px] overflow-auto border rounded p-2 text-sm bg-muted/20 space-y-1">
                <AnimatePresence initial={false}>
                  {events.map((e, i) => <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.01, 0.2) }}>{e}</motion.div>)}
                </AnimatePresence>
                {!events.length && <span className="text-muted-foreground text-sm">No updates yet — press Start to see sentences like “Found 12 companies…”.</span>}
              </div>
              <FieldHelp>Examples: “Scrolling results… page 2”, “Found 12 companies so far”, “Done! Download your spreadsheet.”</FieldHelp>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1">Download spreadsheet <InfoTooltip content="One click downloads CSV for Excel / Google Sheets / calling." /></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!activeRunId && <div className="text-sm text-muted-foreground">Pick a collection to download.</div>}
              <div className="flex gap-2 flex-wrap items-center">
                <Button size="sm" disabled={!activeRunId || csvMut.isPending} onClick={() => csvMut.mutate()}>{csvMut.isPending ? "Preparing…" : "⬇ Download spreadsheet (CSV)"}</Button>
                {csvNote && <span className="text-xs text-muted-foreground">{csvNote}</span>}
              </div>
              <FieldHelp>CSV opens in Excel &amp; Google Sheets. One click prepares + downloads — no extra steps.</FieldHelp>
              {runDetail?.files?.length ? (
                <div className="text-xs text-muted-foreground">Ready files: {runDetail.files.map((f) => f.format).join(", ")}</div>
              ) : (
                !runDetailLoading && <span className="text-xs text-muted-foreground">No files yet — press Download.</span>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1">Schedule — cron <InfoTooltip content="Server runs this list automatically on a cron timetable. Uses scheduler.py + croniter." /></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Current: {schedQ.data?.schedule_cron || "none"}{schedQ.data?.next_run_at ? ` · next run ${schedQ.data.next_run_at}` : ""}
              </div>
              <div className="flex items-center gap-1"><Label>Cron expression</Label><InfoTooltip content="Cron timetable, e.g. '0 9 * * *' = every day at 9am. Empty clears the schedule." /></div>
              <div className="flex gap-2 flex-wrap">
                <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *  (empty clears)" className="max-w-[260px]" />
                <Button size="sm" onClick={() => schedMut.mutate(cron.trim() ? cron.trim() : null)} disabled={schedMut.isPending}>{schedMut.isPending ? "Saving…" : "Save schedule"}</Button>
                {cron && <Button size="sm" variant="outline" onClick={() => { setCron(""); schedMut.mutate(null); }}>Clear</Button>}
              </div>
              <FieldHelp>Example: 0 9 * * * runs daily at 9am. Leave empty + Save to stop automatic runs.</FieldHelp>
              {resumeMut.isError && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{resumeMut.error instanceof Error ? resumeMut.error.message : String(resumeMut.error)}</div>}
              {resumeMut.isSuccess && <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded">Resumed — run #{(resumeMut.data as { run_id: number }).run_id}</div>}
              {schedMsg && <div className="text-xs text-muted-foreground">{schedMsg}</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
