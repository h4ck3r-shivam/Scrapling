import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, fetchOpenApi } from "@/lib/api";
import type { Job } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import Editor from "@monaco-editor/react";

type Template = "custom" | "crawl" | "sitemap" | "xml_feed" | "csv_feed" | "shopify" | "site_to_markdown";

const TEMPLATE_VALUES: Template[] = ["custom", "crawl", "sitemap", "xml_feed", "csv_feed", "shopify", "site_to_markdown"];

type FieldRow = { name: string; method: string; selector: string };

export default function JobNew() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: openapi } = useQuery({ queryKey: ["openapi"], queryFn: fetchOpenApi });

  const routeId = params.id ? Number(params.id) : NaN;
  const queryEditRaw = searchParams.get("edit");
  const queryEditId = queryEditRaw ? Number(queryEditRaw) : NaN;
  const editJobId = !isNaN(routeId) ? routeId : !isNaN(queryEditId) ? queryEditId : queryEditRaw !== null && !isNaN(Number(searchParams.get("id"))) ? Number(searchParams.get("id")) : null;
  const isEditMode = editJobId !== null && !isNaN(editJobId);
  const jobId = isEditMode ? editJobId! : null;

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => apiFetch<Job[]>("/jobs"),
    enabled: isEditMode,
  });
  const editJob = React.useMemo(() => {
    if (!isEditMode || !jobs) return null;
    return jobs.find((j) => j.id === jobId) ?? null;
  }, [isEditMode, jobs, jobId]);

  const { data: singleJob } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      try {
        const j = await apiFetch<Job>(`/jobs/${jobId}`);
        if (j && !j.spec_json_obj && j.spec_json) {
          try { (j as unknown as Record<string, unknown>).spec_json_obj = JSON.parse(j.spec_json); } catch {}
        }
        return j;
      } catch {
        return editJob;
      }
    },
    enabled: isEditMode && !editJob && !!jobId,
    retry: false,
  });
  const jobToEdit = editJob ?? singleJob ?? null;

  // Basic
  const [name, setName] = React.useState("My crawl job");
  const [engine, setEngine] = React.useState<"static" | "dynamic" | "stealth">("static");
  const [template, setTemplate] = React.useState<Template>("custom");
  const [startUrls, setStartUrls] = React.useState("https://example.com");
  const [allowedDomains, setAllowedDomains] = React.useState("");
  // Advanced SpiderSettings
  const [concurrency, setConcurrency] = React.useState(4);
  const [concurrencyPerDomain, setConcurrencyPerDomain] = React.useState(0);
  const [downloadDelay, setDownloadDelay] = React.useState(0);
  const [maxBlockedRetries, setMaxBlockedRetries] = React.useState(3);
  const [robots, setRobots] = React.useState(false);
  const [devMode, setDevMode] = React.useState(false);
  const [devCacheDir, setDevCacheDir] = React.useState("");
  const [autoThrottle, setAutoThrottle] = React.useState(false);
  const [autoStartDelay, setAutoStartDelay] = React.useState(5);
  const [autoMaxDelay, setAutoMaxDelay] = React.useState(60);
  const [autoTargetConc, setAutoTargetConc] = React.useState("");
  const [autoBlockBackoff, setAutoBlockBackoff] = React.useState(true);
  const [fpIncludeKwargs, setFpIncludeKwargs] = React.useState(false);
  const [fpKeepFragments, setFpKeepFragments] = React.useState(false);
  const [fpIncludeHeaders, setFpIncludeHeaders] = React.useState(false);
  const [loggingLevel, setLoggingLevel] = React.useState("DEBUG");
  const [loggingFormat, setLoggingFormat] = React.useState("[%(asctime)s]:({spider_name}) %(levelname)s: %(message)s");
  const [loggingDateFormat, setLoggingDateFormat] = React.useState("%Y-%m-%d %H:%M:%S");
  const [logFile, setLogFile] = React.useState("");
  const [crawldir, setCrawldir] = React.useState("");
  const [checkpointInterval, setCheckpointInterval] = React.useState(300);
  // Template extras
  const [maxPages, setMaxPages] = React.useState(0);
  const [followLinks, setFollowLinks] = React.useState(false);
  const [fieldsJson, setFieldsJson] = React.useState(JSON.stringify([{ name: "title", steps: [{ method: "css", selector: "h1" }] }], null, 2));
  const [exportFormats, setExportFormats] = React.useState("json");
  const [specJson, setSpecJson] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(!isEditMode);
  const hydratedRef = React.useRef(hydrated);
  React.useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);
  const locationState = useLocation().state as { fields?: unknown; html?: string } | null;
  const hasPrefilledFields: boolean = Boolean(locationState && Array.isArray(locationState.fields) && (locationState.fields as unknown[]).length > 0);
  // Visual field builder + per-row test
  const [showAdvancedFields, setShowAdvancedFields] = React.useState(false);
  const [testHtml, setTestHtml] = React.useState("<html><body><h1>Sample title</h1><p class='price'>₹ 499</p><a href='/p/1'>Link</a></body></html>");
  const [rowTest, setRowTest] = React.useState<Record<number, { ok: boolean; msg: string }>>({});
  const [rowTesting, setRowTesting] = React.useState<number | null>(null);

  // Preselect template from ?template= (e.g. /jobs/new?template=crawl from Solutions). Ignored in edit mode.
  React.useEffect(() => {
    if (isEditMode) return;
    const t = searchParams.get("template");
    if (t && (TEMPLATE_VALUES as string[]).includes(t)) {
      setTemplate(t as Template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accept fields passed from Parse playground via navigate("/jobs/new", { state: { fields } })
  React.useEffect(() => {
    if (isEditMode) return;
    const f = locationState?.fields;
    if (f && Array.isArray(f) && f.length) {
      try {
        setFieldsJson(JSON.stringify(f, null, 2));
      } catch { /* keep default */ }
    } else if (typeof locationState?.html === "string" && locationState.html) {
      setTestHtml(locationState.html.slice(0, 20000));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setHydrated(!isEditMode);
    if (isEditMode) setError(null);
  }, [isEditMode, jobId]);

  React.useEffect(() => {
    if (!isEditMode || !jobToEdit || hydrated) return;
    try {
      const spec: Record<string, unknown> = (jobToEdit.spec_json_obj as Record<string, unknown>) ?? (jobToEdit.spec_json ? JSON.parse(jobToEdit.spec_json) : {});
      const settings = (spec.settings as Record<string, unknown> | undefined) ?? {};
      const tplCfg = (spec.template_config as Record<string, unknown> | undefined) ?? {};
      setName(jobToEdit.name ?? (spec as unknown as { name?: string }).name ?? "My crawl job");
      const eng = (jobToEdit.engine ?? spec.engine ?? "static") as string;
      if (["static", "dynamic", "stealth"].includes(eng)) setEngine(eng as never);
      const tpl = (jobToEdit.template ?? spec.template ?? "custom") as Template;
      setTemplate(tpl);
      const startUrlsArr = (settings.start_urls as string[] | undefined) ?? (tplCfg.sitemap_urls as string[] | undefined) ?? (tplCfg.start_urls as string[] | undefined) ?? [];
      if (Array.isArray(startUrlsArr) && startUrlsArr.length) setStartUrls(startUrlsArr.join("\n"));
      else if (typeof tplCfg.target_website === "string" && tplCfg.target_website) setStartUrls(tplCfg.target_website as string);
      const allowed = (settings.allowed_domains as string[] | undefined) ?? (tplCfg.allowed_domains as string[] | undefined) ?? [];
      if (Array.isArray(allowed) && allowed.length) setAllowedDomains(allowed.join(", "));
      if (typeof settings.concurrent_requests === "number") setConcurrency(settings.concurrent_requests as number);
      if (typeof settings.concurrent_requests_per_domain === "number") setConcurrencyPerDomain(settings.concurrent_requests_per_domain as number);
      if (typeof settings.download_delay === "number") setDownloadDelay(settings.download_delay as number);
      if (typeof settings.max_blocked_retries === "number") setMaxBlockedRetries(settings.max_blocked_retries as number);
      if (typeof settings.robots_txt_obey === "boolean") setRobots(settings.robots_txt_obey as boolean);
      if (typeof settings.development_mode === "boolean") setDevMode(settings.development_mode as boolean);
      if (typeof settings.development_cache_dir === "string") setDevCacheDir(settings.development_cache_dir as string);
      if (typeof settings.autothrottle_enabled === "boolean") setAutoThrottle(settings.autothrottle_enabled as boolean);
      if (typeof settings.autothrottle_start_delay === "number") setAutoStartDelay(settings.autothrottle_start_delay as number);
      if (typeof settings.autothrottle_max_delay === "number") setAutoMaxDelay(settings.autothrottle_max_delay as number);
      if (settings.autothrottle_target_concurrency !== undefined && settings.autothrottle_target_concurrency !== null) setAutoTargetConc(String(settings.autothrottle_target_concurrency));
      if (typeof settings.autothrottle_block_backoff === "boolean") setAutoBlockBackoff(settings.autothrottle_block_backoff as boolean);
      if (typeof settings.fp_include_kwargs === "boolean") setFpIncludeKwargs(settings.fp_include_kwargs as boolean);
      if (typeof settings.fp_keep_fragments === "boolean") setFpKeepFragments(settings.fp_keep_fragments as boolean);
      if (typeof settings.fp_include_headers === "boolean") setFpIncludeHeaders(settings.fp_include_headers as boolean);
      if (typeof settings.logging_level === "string") setLoggingLevel(settings.logging_level as string);
      if (typeof settings.logging_format === "string") setLoggingFormat(settings.logging_format as string);
      if (typeof settings.logging_date_format === "string") setLoggingDateFormat(settings.logging_date_format as string);
      if (typeof settings.log_file === "string") setLogFile(settings.log_file as string);
      if (typeof settings.crawldir === "string") setCrawldir(settings.crawldir as string);
      if (typeof settings.checkpoint_interval === "number") setCheckpointInterval(settings.checkpoint_interval as number);
      if (typeof tplCfg.max_pages === "number") setMaxPages(tplCfg.max_pages as number);
      if (typeof tplCfg.follow_links === "boolean") setFollowLinks(tplCfg.follow_links as boolean);
      const fields = tplCfg.fields ?? [];
      try { setFieldsJson(JSON.stringify(fields, null, 2)); } catch {}
      const formats = (spec.export_formats as string[] | undefined) ?? ["json"];
      if (Array.isArray(formats)) setExportFormats(formats.join(","));
      queueMicrotask(() => {
        try { setSpecJson(JSON.stringify(spec, null, 2)); } catch {}
        setHydrated(true);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHydrated(true);
    }
  }, [isEditMode, jobToEdit, hydrated]);

  const fieldRows: FieldRow[] = React.useMemo(() => {
    try {
      const arr = JSON.parse(fieldsJson) as { name?: string; steps?: { method?: string; selector?: string }[] }[];
      if (!Array.isArray(arr)) return [];
      return arr.map((f, i) => ({
        name: String(f?.name ?? `field_${i + 1}`),
        method: String(f?.steps?.[0]?.method ?? "css"),
        selector: String(f?.steps?.[0]?.selector ?? ""),
      }));
    } catch { return []; }
  }, [fieldsJson]);

  function syncRowsToJson(rows: FieldRow[]) {
    const arr = rows.map((r) => ({ name: r.name.trim() || "field", steps: [{ method: r.method, selector: r.selector }] }));
    setFieldsJson(JSON.stringify(arr, null, 2));
  }

  function updateRow(i: number, patch: Partial<FieldRow>) {
    const next = fieldRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    syncRowsToJson(next);
  }

  async function testRow(i: number) {
    const row = fieldRows[i];
    if (!row) return;
    if (!row.selector.trim()) { setRowTest((p) => ({ ...p, [i]: { ok: false, msg: "Add a selector first (e.g. h1)." } })); return; }
    setRowTesting(i);
    try {
      const d = await apiFetch<{ results: { value: unknown }[] }>(`/parse`, {
        method: "POST",
        body: JSON.stringify({ html: testHtml, steps: [{ method: row.method, selector: row.selector }] }),
      });
      const v = d.results?.[0]?.value;
      const s = typeof v === "string" ? v.slice(0, 200) : JSON.stringify(v ?? null).slice(0, 200);
      setRowTest((p) => ({ ...p, [i]: { ok: true, msg: s || "(no match — try another selector)" } }));
    } catch (e) {
      setRowTest((p) => ({ ...p, [i]: { ok: false, msg: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setRowTesting(null);
    }
  }

  const jobSpecPreview = React.useMemo(() => {
    let fields: unknown = [];
    try { fields = JSON.parse(fieldsJson); } catch { fields = []; }
    const settings: Record<string, unknown> = {
      start_urls: startUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      allowed_domains: allowedDomains.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      concurrent_requests: concurrency,
      concurrent_requests_per_domain: concurrencyPerDomain,
      download_delay: downloadDelay,
      max_blocked_retries: maxBlockedRetries,
      robots_txt_obey: robots,
      development_mode: devMode,
      ...(devCacheDir ? { development_cache_dir: devCacheDir } : {}),
      autothrottle_enabled: autoThrottle,
      autothrottle_start_delay: autoStartDelay,
      autothrottle_max_delay: autoMaxDelay,
      ...(autoTargetConc ? { autothrottle_target_concurrency: parseFloat(autoTargetConc) } : {}),
      autothrottle_block_backoff: autoBlockBackoff,
      fp_include_kwargs: fpIncludeKwargs,
      fp_keep_fragments: fpKeepFragments,
      fp_include_headers: fpIncludeHeaders,
      logging_level: loggingLevel,
      logging_format: loggingFormat,
      logging_date_format: loggingDateFormat,
      ...(logFile ? { log_file: logFile } : {}),
      ...(crawldir ? { crawldir } : {}),
      checkpoint_interval: checkpointInterval,
    };
    let template_config: Record<string, unknown> = {};
    if (template === "custom") template_config = { fields, follow_links: followLinks, max_pages: maxPages };
    else if (template === "crawl") template_config = { fields, max_pages: maxPages };
    else if (template === "sitemap") template_config = { sitemap_urls: startUrls.split(/[\n,]+/).map((s)=>s.trim()).filter(Boolean), fields };
    else if (template === "shopify") template_config = { target_website: startUrls.split(/\n/)[0] || "", start_urls: (settings.start_urls as string[]) };
    else if (template === "site_to_markdown") template_config = { allowed_domains: (settings.allowed_domains as string[])?.length ? (settings.allowed_domains as string[]) : ["example.com"], max_pages: maxPages };
    else if (template === "xml_feed" || template === "csv_feed") template_config = { itertag: "item", fields, feed_kind: template === "xml_feed" ? "xml" : "csv" };
    const spec = {
      template,
      engine,
      settings,
      template_config,
      export_formats: exportFormats.split(",").map(s=>s.trim()).filter(Boolean),
    };
    return spec;
  }, [template, engine, startUrls, allowedDomains, concurrency, concurrencyPerDomain, downloadDelay, maxBlockedRetries, robots, devMode, devCacheDir, autoThrottle, autoStartDelay, autoMaxDelay, autoTargetConc, autoBlockBackoff, fpIncludeKwargs, fpKeepFragments, fpIncludeHeaders, loggingLevel, loggingFormat, loggingDateFormat, logFile, crawldir, checkpointInterval, maxPages, followLinks, fieldsJson, exportFormats]);

  React.useEffect(() => {
    if (!hydratedRef.current) return;
    setSpecJson(JSON.stringify(jobSpecPreview, null, 2));
  }, [jobSpecPreview]);

  const createMut = useMutation({
    mutationFn: () => apiFetch<{ id: number }>("/jobs", {
      method: "POST",
      body: JSON.stringify({ name, kind: "crawl", engine, template, spec: JSON.parse(specJson) }),
    }),
    onSuccess: (d) => navigate(`/jobs/${d.id}`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const updateMut = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify({ name, kind: "crawl", engine, template, spec: JSON.parse(specJson) }),
    }),
    onSuccess: () => navigate(`/jobs/${jobId}`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const jobSpecSchema = (openapi as unknown as { components?: { schemas?: Record<string, unknown> } })?.components?.schemas?.["JobSpec"] as unknown as string | undefined;

  const isPending = createMut.isPending || updateMut.isPending;
  const handleSubmit = () => {
    setError(null);
    try { JSON.parse(specJson); } catch { setError("spec JSON is invalid JSON"); return; }
    if (!name.trim()) { setError("Name is required"); return; }
    if (isEditMode) updateMut.mutate();
    else createMut.mutate();
  };

  if (isEditMode && jobsLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading job #{jobId}…</div>;
  }
  if (isEditMode && !jobsLoading && !jobToEdit) {
    return (
      <div className="space-y-4 max-w-5xl">
        <h1 className="text-2xl font-semibold">Edit Job #{jobId}</h1>
        <Card><CardContent className="p-6 space-y-3">
          <div className="text-sm text-destructive">Job #{jobId} not found. It may have been deleted.</div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => navigate("/jobs")}>Back to Jobs</Button><Button onClick={() => navigate("/jobs/new")}>New Job</Button></div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">{isEditMode ? `Edit list #${jobId}` : hasPrefilledFields ? "New list — from Parse playground" : "New list — what to collect"}</h1>
      {isEditMode && jobToEdit && <div className="text-sm text-muted-foreground">Editing <span className="font-medium">{jobToEdit.name}</span> · {jobToEdit.engine} · {jobToEdit.template} · <a className="underline" href={`/jobs/${jobId}`}>view results →</a></div>}
      {!isEditMode && hasPrefilledFields && <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded">Columns pre-filled from Parse playground. Review, Test each row, then save.</div>}
      <PageHelp title={helpTexts.jobs.title} description={helpTexts.jobs.description} tips={helpTexts.jobs.tips} />
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="template">Columns</TabsTrigger>
          <TabsTrigger value="export">Review & Save</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Basic — name, start links, speed</CardTitle><CardDescription>Start here. The Columns tab defines what to collect.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Name</Label><InfoTooltip content={helpTexts.jobs.fields.name} /></div><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily product crawl" /><FieldHelp>{helpTexts.jobs.fields.name}</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Engine</Label><InfoTooltip content={helpTexts.jobs.fields.engine} /></div>
                  <Select value={engine} onChange={(e) => setEngine(e.target.value as never)}><option value="static">static (curl_cffi) – fastest</option><option value="dynamic">dynamic (playwright)</option><option value="stealth">stealth (patchright)</option></Select><FieldHelp>{helpTexts.engines.fields[engine]}</FieldHelp>
                </div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Template</Label><InfoTooltip content={helpTexts.jobs.fields.template} /></div>
                  <Select value={template} onChange={(e) => setTemplate(e.target.value as Template)}>
                    <option value="custom">custom – full control</option><option value="crawl">crawl – follow links</option><option value="sitemap">sitemap – via sitemap.xml</option><option value="xml_feed">xml_feed – RSS/Atom</option><option value="csv_feed">csv_feed</option><option value="shopify">shopify – store</option><option value="site_to_markdown">site_to_markdown – RAG</option>
                  </Select><FieldHelp>{helpTexts.templates.fields[template === "custom" ? "custom" : template === "crawl" ? "crawl" : template === "sitemap" ? "sitemap" : template === "shopify" ? "shopify" : template === "site_to_markdown" ? "siteToMarkdown" : template === "xml_feed" ? "xmlFeed" : "csvFeed"]}</FieldHelp>
                </div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Start URLs</Label><InfoTooltip content={helpTexts.jobs.fields.startUrls} /></div><Textarea value={startUrls} onChange={(e) => setStartUrls(e.target.value)} rows={3} placeholder="https://example.com/products&#10;https://example.com/blog" /><FieldHelp>{helpTexts.jobs.fields.startUrls}</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Allowed domains</Label><InfoTooltip content={helpTexts.jobs.fields.allowedDomains} /></div><Input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} placeholder="example.com, cdn.example.com" /><FieldHelp>Comma separated – empty = stay on start domain only.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Concurrent requests</Label><InfoTooltip content={helpTexts.jobs.fields.concurrency} /></div><Input type="number" value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value || "0", 10))} /><FieldHelp>2–5 safe, 10+ only if you own the site.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Download delay (s)</Label><InfoTooltip content={helpTexts.jobs.fields.downloadDelay} /></div><Input type="number" step="0.5" value={downloadDelay} onChange={(e) => setDownloadDelay(parseFloat(e.target.value || "0"))} /><FieldHelp>1–2 gentle, 0 no delay.</FieldHelp></div>
                <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={robots} onChange={(e) => setRobots(e.target.checked)} /> <Label>robots.txt obey</Label><InfoTooltip content={helpTexts.jobs.fields.robotsTxt} /></div>
                <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={followLinks} onChange={(e) => setFollowLinks(e.target.checked)} /> <Label>Follow links (custom)</Label><InfoTooltip content={helpTexts.jobs.fields.followLinks} /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Advanced SpiderSettingsSpec</CardTitle><CardDescription>Every field from spiders/spider.py – concurrency, throttling, fingerprint, logging, checkpoint.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Per-domain concurrency</Label><InfoTooltip content="0 = use global concurrency; else limit per domain" /></div><Input type="number" value={concurrencyPerDomain} onChange={(e)=>setConcurrencyPerDomain(parseInt(e.target.value||"0",10))} /><FieldHelp>0 = unlimited per domain.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Max blocked retries</Label><InfoTooltip content="How many times to retry if site returns 429/403" /></div><Input type="number" value={maxBlockedRetries} onChange={(e)=>setMaxBlockedRetries(parseInt(e.target.value||"0",10))} /></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Checkpoint interval (s)</Label><InfoTooltip content="How often to save progress for pause/resume – 300s = 5 min" /></div><Input type="number" value={checkpointInterval} onChange={(e)=>setCheckpointInterval(parseFloat(e.target.value||"0"))} /></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Crawldir</Label><InfoTooltip content="Folder for checkpoints – enables pause/resume. Empty = temp folder" /></div><Input value={crawldir} onChange={(e)=>setCrawldir(e.target.value)} placeholder="crawls/myjob" /><FieldHelp>Requires server write to webapp/data/crawls.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Log file</Label><InfoTooltip content="Optional file for spider logs – e.g., logs/myjob.log" /></div><Input value={logFile} onChange={(e)=>setLogFile(e.target.value)} /></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Logging level</Label><InfoTooltip content="DEBUG = verbose, INFO = normal, WARNING/ERROR less" /></div><Select value={loggingLevel} onChange={(e)=>setLoggingLevel(e.target.value)}><option>DEBUG</option><option>INFO</option><option>WARNING</option><option>ERROR</option><option>CRITICAL</option></Select></div>
                <div className="space-y-2 md:col-span-2"><div className="flex items-center gap-1"><Label>Logging format</Label><InfoTooltip content="Python logging format – e.g., [%(asctime)s]:({spider_name}) %(levelname)s: %(message)s" /></div><Input value={loggingFormat} onChange={(e)=>setLoggingFormat(e.target.value)} placeholder="[%(asctime)s]:({spider_name}) %(levelname)s: %(message)s" /><FieldHelp>Spider log line format – advanced.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Logging date format</Label><InfoTooltip content="Date format for logs – e.g., %Y-%m-%d %H:%M:%S" /></div><Input value={loggingDateFormat} onChange={(e)=>setLoggingDateFormat(e.target.value)} placeholder="%Y-%m-%d %H:%M:%S" /><FieldHelp>Strptime format for asctime.</FieldHelp></div>
                <div className="space-y-2 flex items-center gap-2 pt-6"><input type="checkbox" checked={devMode} onChange={(e)=>setDevMode(e.target.checked)} /><Label>Development mode</Label><InfoTooltip content="Cache responses to webapp/data/dev_cache – re-run parse without hitting site again" /></div>
                {devMode && <div className="space-y-2"><Label>Dev cache dir</Label><Input value={devCacheDir} onChange={(e)=>setDevCacheDir(e.target.value)} placeholder="webapp/data/dev_cache/myjob" /></div>}
              </div>
              <div className="border rounded p-3 space-y-3">
                <div className="font-medium flex items-center gap-1">AutoThrottle <InfoTooltip content="Automatically tune delay per domain based on response latency – speeds up when fast, slows when blocked" /></div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2"><input type="checkbox" checked={autoThrottle} onChange={(e)=>setAutoThrottle(e.target.checked)} /><Label>Enabled</Label></div>
                  <div className="space-y-2"><Label>Start delay (s)</Label><Input type="number" step="0.5" value={autoStartDelay} onChange={(e)=>setAutoStartDelay(parseFloat(e.target.value||"0"))} /></div>
                  <div className="space-y-2"><Label>Max delay (s)</Label><Input type="number" step="0.5" value={autoMaxDelay} onChange={(e)=>setAutoMaxDelay(parseFloat(e.target.value||"0"))} /></div>
                  <div className="space-y-2"><Label>Target concurrency</Label><Input value={autoTargetConc} onChange={(e)=>setAutoTargetConc(e.target.value)} placeholder="e.g., 2.0" /><FieldHelp>Empty = concurrent_requests_per_domain or 1.0</FieldHelp></div>
                  <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={autoBlockBackoff} onChange={(e)=>setAutoBlockBackoff(e.target.checked)} /><Label>Block backoff (2× on 429)</Label></div>
                </div>
              </div>
              <div className="border rounded p-3 space-y-2">
                <div className="font-medium">Fingerprint (request dedup) – fp_include_*</div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2"><input type="checkbox" checked={fpIncludeKwargs} onChange={(e)=>setFpIncludeKwargs(e.target.checked)} /><Label>Include kwargs</Label><InfoTooltip content="If on, different query params = different fingerprint" /></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={fpKeepFragments} onChange={(e)=>setFpKeepFragments(e.target.checked)} /><Label>Keep fragments (#hash)</Label></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={fpIncludeHeaders} onChange={(e)=>setFpIncludeHeaders(e.target.checked)} /><Label>Include headers</Label></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>What to collect — {template}</CardTitle><CardDescription>Add one row per column you want in your spreadsheet. Test each selector instantly.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Max pages (0 = unlimited)</Label><InfoTooltip content={helpTexts.jobs.fields.maxPages} /></div><Input type="number" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value || "0", 10))} /><FieldHelp>Test with 10 first.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Export formats</Label><InfoTooltip content={helpTexts.jobs.fields.exportFormats} /></div><Input value={exportFormats} onChange={(e)=>setExportFormats(e.target.value)} placeholder="json,csv" /><FieldHelp>Comma: json, jsonl, csv, xml</FieldHelp></div>
              </div>
              <PageHelp title="Columns builder — no code needed" description="Each row becomes one column in your CSV (e.g. name, phone, price). Pick how to find it, type the selector, then press Test." tips={["Start with title + price, Test each row, then add phone/address.", "Use the Parse playground for tricky sites — send HTML there and back."]} />
              <div className="space-y-2">
                <div className="flex items-center gap-1"><Label>Sample page HTML for testing</Label><InfoTooltip content="We test your selector against this HTML. Paste real HTML from Fetch for accurate tests." /></div>
                <Textarea value={testHtml} onChange={(e) => setTestHtml(e.target.value)} rows={3} />
                <FieldHelp>Paste real HTML from Fetch → copy html_content here, then Test each row.</FieldHelp>
              </div>
              <div className="space-y-3">
                {fieldRows.map((row, i) => (
                  <div key={i} className="border rounded p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Column {i + 1}</span>
                      <Button size="sm" variant="outline" onClick={() => syncRowsToJson(fieldRows.filter((_, idx) => idx !== i))}>Remove</Button>
                    </div>
                    <div className="grid md:grid-cols-[1fr_160px_1fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1"><Label>Column name</Label><InfoTooltip content="Header in your CSV — e.g. title, price, phone" /></div>
                        <Input value={row.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder="title" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1"><Label>Method</Label><InfoTooltip content={helpTexts.parse.fields.method} /></div>
                        <Select value={row.method} onChange={(e) => updateRow(i, { method: e.target.value })}>
                          <option>css</option><option>xpath</option><option>find_all</option><option>find_by_text</option><option>find_by_regex</option><option>find_similar</option><option>re</option><option>get_all_text</option><option>attrib_get</option><option>json</option>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1"><Label>Selector</Label><InfoTooltip content={helpTexts.parse.fields.selector} /></div>
                        <Input value={row.selector} onChange={(e) => updateRow(i, { selector: e.target.value })} placeholder="h1, .price, //div" />
                      </div>
                      <Button size="sm" variant="secondary" disabled={rowTesting === i} onClick={() => testRow(i)}>{rowTesting === i ? "Testing…" : "Test"}</Button>
                    </div>
                    {rowTest[i] && <div className={`text-xs p-2 rounded ${rowTest[i].ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-destructive/10 text-destructive"}`}>{rowTest[i].msg}</div>}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => syncRowsToJson([...fieldRows, { name: `field_${fieldRows.length + 1}`, method: "css", selector: "" }])}>+ Add column</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAdvancedFields((v) => !v)}>{showAdvancedFields ? "Hide advanced JSON" : "Show advanced JSON"}</Button>
                </div>
                <FieldHelp>Steps: css, xpath, find_all, find_by_text, find_by_regex, find_similar, re, get_all_text, attrib_get, json. Use the Test button to try each selector instantly.</FieldHelp>
              </div>
              {showAdvancedFields && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1"><Label>Advanced — field mapping JSON</Label><InfoTooltip content={helpTexts.jobs.fields.fieldsMapping} /></div>
                  <div className="border rounded-md overflow-hidden" style={{ height: 200 }}>
                    <Editor height="200px" defaultLanguage="json" value={fieldsJson} onChange={(v) => setFieldsJson(v || "[]")} options={{ minimap: { enabled: false } }} />
                  </div>
                  <FieldHelp>Power users only — the visual builder above edits this same JSON.</FieldHelp>
                </div>
              )}
              {template === "shopify" && <div className="text-xs text-muted-foreground">Shopify needs target_website = startUrls[0] – already set.</div>}
              {template === "site_to_markdown" && <div className="text-xs text-muted-foreground">Site to Markdown needs allowed domains + max pages – used for knowledge base. See AI page.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Review &amp; save</CardTitle><CardDescription>Full recipe preview for power users. The form above is the source of truth — edit here only if you know JSON.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <div className="border rounded-md overflow-hidden" style={{ height: 380 }}>
                <Editor height="380px" defaultLanguage="json" value={specJson} onChange={(v) => setSpecJson(v || "{}")} options={{ minimap: { enabled: false } }} />
              </div>
              {openapi && <p className="text-xs text-muted-foreground">Recipe schema {jobSpecSchema ? "loaded" : "loading"} — validated automatically on save.</p>}
              {error && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</div>}
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={isPending}>{isPending ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update job" : "Create job")}</Button>
                <Button variant="outline" onClick={() => navigate(isEditMode ? `/jobs/${jobId}` : "/jobs")}>Cancel</Button>
                {isEditMode && <Button variant="ghost" onClick={() => navigate("/jobs")}>Back to list</Button>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
