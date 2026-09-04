import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { JobOut } from "@/lib/types";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp } from "@/components/ui/help";
import { helpTexts } from "@/lib/helpTexts";
import { useConfirm } from "@/hooks/useConfirm";
import { Play, Pause, Square, Pencil, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export default function JobsList() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { data, isLoading, error } = useQuery<JobOut[]>({
    queryKey: ["jobs"],
    queryFn: () => apiFetch("/jobs"),
    refetchInterval: 5_000,
  });

  const startMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/jobs/${id}/start`, { method: "POST" }),
    onSuccess: (res: unknown) => {
      toast.success(`Job started (run #${(res as { run_id?: number }).run_id ?? "?"})`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: unknown) => toast.error(`Start failed: ${String((e as Error).message)}`),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { toast.success("Cancel requested"); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e: unknown) => toast.error(`Cancel failed: ${String((e as Error).message)}`),
  });
  const pauseMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/jobs/${id}/pause`, { method: "POST" }),
    onSuccess: () => { toast.success("Pause requested"); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e: unknown) => toast.error(`Pause failed: ${String((e as Error).message)}`),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Job deleted"); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e: unknown) => toast.error(`Delete failed: ${String((e as Error).message)}`),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link to="/jobs/new"><Button>New Job</Button></Link>
        </motion.div>
      </motion.div>
      <PageHelp
        title={helpTexts.jobs.title}
        description={helpTexts.jobs.description}
        tips={helpTexts.jobs.tips}
      />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle>Saved jobs</CardTitle>
            <CardDescription>Every saved crawler recipe. Click a row to open it.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-3 py-2">
                <SkeletonTable rows={4} cols={5} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              </div>
            )}
            {error && <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-sm text-destructive">{String((error as Error).message)}</motion.div>}
            {/* Polished shimmer skeleton already shown above while loading; table renders after */}
            {!isLoading && <Skeleton className="hidden" />}
            {isMobile ? (
              <div className="grid gap-3">
                <AnimatePresence>
                  {data?.map((j, idx) => (
                    <motion.div
                      key={j.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ delay: idx * 0.04, duration: 0.3 }}
                    >
                      <Card className="card-hover">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Link to={`/jobs/${j.id}`} className="underline font-semibold hover:text-primary transition-colors truncate">
                              #{j.id} · {j.name}
                            </Link>
                            {j.running ? (
                              <Badge className="animate-pulse shrink-0"><span className="h-1.5 w-1.5 rounded-full bg-white mr-1.5 animate-pulse inline-block" />running</Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0">idle</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <Badge variant="secondary">{j.engine}</Badge>
                            <Badge variant="outline">{j.template}</Badge>
                            {j.schedule_cron && <Badge variant="outline" title="cron expression">{j.schedule_cron}</Badge>}
                          </div>
                          <div className="flex gap-1.5 flex-wrap pt-1">
                            <Button size="sm" aria-label={`Start job ${j.name}`} onClick={() => startMut.mutate(j.id)} disabled={j.running}>
                              <Play className="h-3 w-3 mr-1" aria-hidden /> Start
                            </Button>
                            <Button size="sm" variant="secondary" aria-label={`Pause job ${j.name}`} onClick={() => pauseMut.mutate(j.id)} disabled={!j.running}>
                              <Pause className="h-3 w-3 mr-1" aria-hidden /> Pause
                            </Button>
                            <Link to={`/jobs/${j.id}/edit`}>
                              <Button size="sm" variant="outline" aria-label={`Edit job ${j.name}`}><Pencil className="h-3 w-3 mr-1" aria-hidden /> Edit</Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Delete job ${j.name}`}
                              onClick={async () => {
                                if (await confirm(`Delete job "${j.name}"?`, "All runs and results will be removed.", { destructive: true })) {
                                  delMut.mutate(j.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3 mr-1" aria-hidden /> Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {data?.length === 0 && (
                  <div className="text-center text-muted-foreground py-6 text-sm">
                    No jobs yet — click “New Job” above to create one.
                  </div>
                )}
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {data?.map((j, idx) => (
                    <motion.tr key={j.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ delay: idx * 0.04, duration: 0.3 }} className="border-b transition-all duration-200 hover:bg-muted/50">
                      <TableCell>{j.id}</TableCell>
                      <TableCell><Link to={`/jobs/${j.id}`} className="underline font-medium hover:text-primary transition-colors">{j.name}</Link></TableCell>
                      <TableCell><Badge variant="secondary" className="transition-transform hover:scale-105">{j.engine}</Badge></TableCell>
                      <TableCell>{j.template}</TableCell>
                      <TableCell>
                        {j.running ? <Badge className="animate-pulse shadow-sm"><span className="h-1.5 w-1.5 rounded-full bg-white mr-1.5 animate-pulse inline-block" />running</Badge> : <Badge variant="outline">idle</Badge>}
                      </TableCell>
                      <TableCell>
                        {j.schedule_cron ? (
                          <Badge variant="outline" title="cron expression">{j.schedule_cron}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" aria-label={`Start job ${j.name}`} onClick={() => startMut.mutate(j.id)} disabled={j.running}>
                            {startMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" aria-hidden />} Start
                          </Button>
                          <Button size="sm" variant="secondary" aria-label={`Pause job ${j.name}`} onClick={() => pauseMut.mutate(j.id)} disabled={!j.running}>
                            <Pause className="h-3 w-3 mr-1" aria-hidden /> Pause
                          </Button>
                          <Button size="sm" variant="destructive" aria-label={`Cancel job ${j.name}`} onClick={() => cancelMut.mutate(j.id)} disabled={!j.running}>
                            <Square className="h-3 w-3 mr-1" aria-hidden /> Cancel
                          </Button>
                          <Link to={`/jobs/${j.id}/edit`}>
                            <Button size="sm" variant="outline" aria-label={`Edit job ${j.name}`}><Pencil className="h-3 w-3 mr-1" aria-hidden /> Edit</Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Delete job ${j.name}`}
                            onClick={async () => {
                              if (await confirm(`Delete job "${j.name}"?`, "All runs and results will be removed.", { destructive: true })) {
                                delMut.mutate(j.id);
                              }
                            }}
                          >
                            {delMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" aria-hidden />} Delete
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No jobs yet — click “New Job” above to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
      {ConfirmDialog}
    </motion.div>
  );
}
