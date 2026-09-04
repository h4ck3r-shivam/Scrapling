import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadExport } from "@/lib/api";
import type { JobRun } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ResultsTable } from "@/components/ResultsTable";

export default function RunsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const jobIdParam = searchParams.get("job_id");
  const jobId = jobIdParam ? Number(jobIdParam) : null;
  const hasJobFilter = jobId !== null && !isNaN(jobId);

  const [limit, setLimit] = React.useState(100);
  const [jobIdInput, setJobIdInput] = React.useState(jobIdParam ?? "");
  const [selectedRun, setSelectedRun] = React.useState<number | null>(null);
  const [q, setQ] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const pageSize = 200;
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [csvNote, setCsvNote] = React.useState<string | null>(null);

  React.useEffect(() => { setJobIdInput(jobIdParam ?? ""); }, [jobIdParam]);
  React.useEffect(() => { setOffset(0); }, [selectedRun, q]);
  React.useEffect(() => { setSelectedRun(null); setOffset(0); }, [jobId, limit]);

  const runsQuery = useQuery({
    queryKey: ["runs-global", hasJobFilter ? jobId : "all", limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (hasJobFilter) params.set("job_id", String(jobId));
      params.set("limit", String(limit));
      const qs = params.toString();
      return apiFetch<JobRun[]>(`/runs?${qs}`);
    },
    refetchInterval: 5000,
  });

  const activeRunId = selectedRun ?? runsQuery.data?.[0]?.id ?? null;

  const runDetailQ = useQuery({
    queryKey: ["run", activeRunId],
    queryFn: () => apiFetch<JobRun & { files: { format: string; path: string }[] }>(`/runs/${activeRunId}`),
    enabled: !!activeRunId,
  });

  const resultsQ = useQuery({
    queryKey: ["results", activeRunId, q, offset],
    queryFn: () => apiFetch<{ total: number; items: { idx: number; item: unknown }[] }>(
      `/runs/${activeRunId}/results?limit=${pageSize}&offset=${offset}&q=${encodeURIComponent(q)}`
    ),
    enabled: !!activeRunId,
  });

  const deleteMut = useMutation({
    mutationFn: (runId: number) => apiFetch(`/runs/${runId}`, { method: "DELETE" }),
    onSuccess: (_data, runId) => {
      setDeleteError(null);
      qc.invalidateQueries({ queryKey: ["runs-global"] });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["results"] });
      if (selectedRun === runId) setSelectedRun(null);
    },
    onError: (e: unknown) => setDeleteError(e instanceof Error ? e.message : String(e)),
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

  const applyJobFilter = () => {
    const v = jobIdInput.trim();
    if (!v) {
      searchParams.delete("job_id");
      setSearchParams(searchParams);
    } else {
      const n = Number(v);
      if (isNaN(n)) { setDeleteError("List number must be a number"); return; }
      setSearchParams({ job_id: String(n) });
    }
    setDeleteError(null);
  };

  const clearFilter = () => {
    setJobIdInput("");
    searchParams.delete("job_id");
    setSearchParams(searchParams);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-7xl">
      <PageHelp title="All collections — pick one to call" description="Every collection is one run of a list. Pick one to see its rows, copy phones, or download the spreadsheet." tips={["Use search to filter rows (e.g. Nairobi).", "Phone column has Copy + WhatsApp per row.", "One click downloads CSV for Excel."]} />
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-1">All collections <InfoTooltip content="Newest first. Pick View to see rows." /></h1>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>Refresh</Button>
          <Link to="/jobs"><Button size="sm" variant="ghost">Lists →</Button></Link>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1">Filter <InfoTooltip content="Narrow to one list or change how many collections to show." /></CardTitle>
            <CardDescription>Pick a list to focus, or show everything. Click View to see rows &amp; download.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-[200px_160px_1fr] gap-3 items-end">
              <div className="space-y-2">
                <div className="flex items-center gap-1"><Label>List filter</Label><InfoTooltip content="Enter a list number to show only its collections. Empty = all." /></div>
                <div className="flex gap-1">
                  <Input placeholder="e.g. 1 (empty = all)" value={jobIdInput} onChange={(e) => setJobIdInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyJobFilter()} />
                </div>
                <FieldHelp>Empty shows all lists.</FieldHelp>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1"><Label>Show</Label><InfoTooltip content="How many recent collections to show." /></div>
                <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                </Select>
              </div>
              <div className="flex gap-2 pb-1">
                <Button size="sm" onClick={applyJobFilter}>Apply</Button>
                <Button size="sm" variant="outline" onClick={clearFilter}>Clear</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate("/runs")}>Reset</Button>
              </div>
            </div>
            {hasJobFilter && <div className="text-xs text-muted-foreground">Showing list #{jobId} · <Link to={`/jobs/${jobId}`} className="underline">Open list #{jobId}</Link></div>}
            {!isAdmin && <div className="text-xs text-muted-foreground">Deleting needs an admin account.</div>}
            {deleteError && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{deleteError}</div>}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardHeader><CardTitle>Collections · {runsQuery.data?.length ?? 0} {runsQuery.isFetching && "(updating…)"}</CardTitle></CardHeader>
          <CardContent>
            {runsQuery.isLoading ? (
              <div className="space-y-3">
                <SkeletonTable rows={5} cols={6} />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ) : (
              <>
                {runsQuery.error && <div className="text-sm text-destructive">{String((runsQuery.error as Error).message)}</div>}
                {isMobile ? (
                  <div className="grid gap-3">
                    <AnimatePresence>
                      {runsQuery.data?.map((r, idx) => (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ delay: idx * 0.03, duration: 0.25 }}
                        >
                          <Card className={`card-hover ${activeRunId === r.id ? "ring-2 ring-primary" : ""}`}>
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold">#{r.id}</span>
                                <Badge variant={r.status === "running" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {r.job_name ?? `List #${r.job_id}`} · {r.items_count} rows · {r.started_at ?? "—"}
                              </div>
                              <div className="flex gap-1.5 flex-wrap pt-1">
                                <Button size="sm" aria-label={`View collection ${r.id}`} variant={activeRunId === r.id ? "default" : "outline"} onClick={() => setSelectedRun(r.id)}>View</Button>
                                <Link to={`/jobs/${r.job_id}`}><Button size="sm" variant="ghost" aria-label={`Open list ${r.job_id}`}>List #{r.job_id} →</Button></Link>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  aria-label={`Delete collection ${r.id}`}
                                  disabled={!isAdmin || deleteMut.isPending}
                                  title={isAdmin ? "Delete (admin)" : "Admin only"}
                                  onClick={() => {
                                    if (!confirm(`Delete collection #${r.id}? This removes results & files.`)) return;
                                    deleteMut.mutate(r.id);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {runsQuery.data?.length === 0 && <div className="text-center text-muted-foreground text-sm">No collections yet — start a list to see data.</div>}
                  </div>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>List</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {runsQuery.data?.map((r, idx) => (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ delay: idx * 0.03, duration: 0.25 }}
                          className={activeRunId === r.id ? "bg-accent/50 border-b" : "border-b hover:bg-muted/50 transition-colors"}
                        >
                          <TableCell className="font-mono">#{r.id}</TableCell>
                          <TableCell>{r.job_id}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={r.job_name}>{r.job_name ?? "—"}</TableCell>
                          <TableCell><Badge variant={r.status === "running" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></TableCell>
                          <TableCell className="text-xs">{r.started_at ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.ended_at ?? "—"}</TableCell>
                          <TableCell>{r.items_count}</TableCell>
                          <TableCell className="flex gap-1 flex-wrap">
                            <Button size="sm" aria-label={`View collection ${r.id}`} variant={activeRunId === r.id ? "default" : "outline"} onClick={() => setSelectedRun(r.id)}>View</Button>
                            <Link to={`/jobs/${r.job_id}`}><Button size="sm" variant="ghost" aria-label={`Open list ${r.job_id}`}>List #{r.job_id} →</Button></Link>
                            <Button
                              size="sm"
                              variant="destructive"
                              aria-label={`Delete collection ${r.id}`}
                              disabled={!isAdmin || deleteMut.isPending}
                              title={isAdmin ? "Delete (admin)" : "Admin only"}
                              onClick={() => {
                                if (!confirm(`Delete collection #${r.id}? This removes results & files.`)) return;
                                deleteMut.mutate(r.id);
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {runsQuery.data?.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No collections yet — start a list to see data.</TableCell></TableRow>}
                  </TableBody>
                </Table>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {activeRunId && (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-1">Collection #{activeRunId} <InfoTooltip content="Summary of this collection run." /></CardTitle>
                  <CardDescription>{runDetailQ.data ? `${runDetailQ.data.status} · list ${runDetailQ.data.job_id} ${runDetailQ.data.job_name ? `(${runDetailQ.data.job_name})` : ""} · ${runDetailQ.data.items_count} rows` : "Loading…"}</CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Button size="sm" disabled={csvMut.isPending} onClick={() => csvMut.mutate()}>{csvMut.isPending ? "Preparing…" : "⬇ Download spreadsheet (CSV)"}</Button>
                  {runDetailQ.data && <Link to={`/jobs/${runDetailQ.data.job_id}`}><Button size="sm" variant="outline">Open list</Button></Link>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {csvNote && <div className="text-xs text-muted-foreground">{csvNote}</div>}
                <FieldHelp>One click prepares + downloads the spreadsheet. No extra steps.</FieldHelp>
                {runDetailQ.data?.files?.length ? (
                  <div className="text-xs text-muted-foreground">Ready files: {runDetailQ.data.files.map((f) => f.format).join(", ")}</div>
                ) : (
                  !runDetailQ.isLoading && <span className="text-xs text-muted-foreground">No files yet — press Download.</span>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="flex-1 flex items-center gap-1">Rows — ready to call <InfoTooltip content="Columns come from your fields. Copy phone or WhatsApp per row." /></CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Search</Label>
                  <Input placeholder="e.g. Nairobi" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-[260px]" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Total {resultsQ.data?.total ?? 0} · showing {resultsQ.data?.items.length ?? 0} · page {Math.floor(offset / pageSize) + 1}</span>
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - pageSize))}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={!resultsQ.data || offset + pageSize >= (resultsQ.data.total ?? 0)} onClick={() => setOffset((o) => o + pageSize)}>Next</Button>
                  </div>
                </div>
                {resultsQ.isLoading ? (
                  <SkeletonTable rows={6} cols={4} />
                ) : (
                  <ResultsTable rows={resultsQ.data?.items ?? []} />
                )}
                <FieldHelp>Tip: search narrows rows. Columns are dynamic — from your first result.</FieldHelp>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
      {!activeRunId && runsQuery.data && runsQuery.data.length > 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground">Pick View to see rows &amp; download.</motion.div>}
    </motion.div>
  );
}
