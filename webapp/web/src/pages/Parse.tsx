import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

type Step = { 
  method: string; 
  selector?: string; 
  attr?: string; 
  first_only?: boolean; 
  adaptive?: boolean; 
  identifier?: string; 
  percentage?: number;
  auto_save?: boolean;
  partial?: boolean;
  case_sensitive?: boolean;
  similarity_threshold?: number;
};

export default function ParsePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { html?: string; url?: string } };
  const [html, setHtml] = React.useState("<html><body><h1>Hello</h1><p class='x'>world</p><a href='/page/2'>Next</a></body></html>");
  const [cameFromFetch, setCameFromFetch] = React.useState<string | null>(null);

  React.useEffect(() => {
    const h = location.state?.html;
    if (typeof h === "string" && h.length) {
      setHtml(h.slice(0, 200000));
      if (location.state?.url) setCameFromFetch(location.state.url);
      else setCameFromFetch("Fetch console");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [steps, setSteps] = React.useState<Step[]>([{ method: "css", selector: "h1" }]);
  const [adaptive, setAdaptive] = React.useState(false);
  const [tree, setTree] = React.useState<unknown[]>([]);
  const [results, setResults] = React.useState<{ method: string; selector?: string; value: unknown }[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  const selectorsQ = useQuery({ queryKey: ["selectors"], queryFn: () => apiFetch<unknown[]>("/selectors") });

  const parseMut = useMutation({
    mutationFn: () => apiFetch<{ results: { method: string; selector?: string; value: unknown }[]; tree: unknown[] }>("/parse", { method: "POST", body: JSON.stringify({ html, steps, adaptive }) }),
    onSuccess: (d) => { setResults(d.results); setTree(d.tree); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const treeMut = useMutation({
    mutationFn: () => apiFetch<unknown[]>("/parse/tree", { method: "POST", body: JSON.stringify({ html }) }),
    onSuccess: (d) => setTree(d),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiFetch("/selectors", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["selectors"] }),
  });

  function updateStep(i: number, patch: Partial<Step>) { setSteps((s) => s.map((x, idx) => idx === i ? { ...x, ...patch } : x)); }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold flex items-center gap-1">Test selectors <InfoTooltip content="Paste HTML, try selectors, then send them to a new list — no copy-paste." /></motion.h1>
      <PageHelp title="Test what to collect — then use in a list" description={helpTexts.parse.description} tips={[...helpTexts.parse.tips, "Came from Fetch? HTML is pre-filled. Test, then press Use in New List."]} />
      {cameFromFetch && <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded">HTML pre-filled from {cameFromFetch}. Test below, then send to a new list.</div>}
      <Tabs defaultValue="playground" className="w-full">
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="tree">DOM Tree</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="helpers">Helpers</TabsTrigger>
        </TabsList>

        <TabsContent value="playground" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1">Page HTML + what to grab <InfoTooltip content="Define one step per piece of info, test instantly." /></CardTitle><CardDescription>Try one selector at a time, then send to a new list.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><div className="flex items-center gap-1"><Label>Page HTML</Label><InfoTooltip content={helpTexts.parse.fields.html} /></div>
                <div className="border rounded overflow-hidden" style={{ height: 200 }}><Editor height="200px" language="html" value={html} onChange={(v) => setHtml(v || "")} options={{ minimap: { enabled: false } }} /></div><FieldHelp>Paste real page HTML, or use Send from Fetch to pre-fill.</FieldHelp></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} /> <Label>adaptive (Selector adaptive=true)</Label><InfoTooltip content={helpTexts.parse.fields.adaptive} /></div>

              <AnimatePresence>
                {steps.map((st, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ delay: i * 0.04 }} layout className="border rounded p-3 space-y-3 bg-muted/20 hover:border-primary/15 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">Step {i+1}</span><Button size="sm" variant="outline" onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}>Remove</Button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><div className="flex items-center gap-1"><Label>method</Label><InfoTooltip content={helpTexts.parse.fields.method} /></div><Select value={st.method} onChange={(e) => updateStep(i, { method: e.target.value })}><option>css</option><option>xpath</option><option>find_all</option><option>find_by_text</option><option>find_by_regex</option><option>find_similar</option><option>re</option><option>get_all_text</option><option>attrib_get</option><option>json</option></Select><FieldHelp>css: h1.title, xpath: //div[@class='x'], find_by_text: plain text</FieldHelp></div>
                    <div className="space-y-1"><div className="flex items-center gap-1"><Label>selector / pattern</Label><InfoTooltip content={helpTexts.parse.fields.selector} /></div><Input value={st.selector ?? ""} onChange={(e) => updateStep(i, { selector: e.target.value })} placeholder="h1, //div, .class, regex" /><FieldHelp>Leave blank for get_all_text</FieldHelp></div>
                    <div className="space-y-1"><div className="flex items-center gap-1"><Label>attr</Label><InfoTooltip content={helpTexts.parse.fields.attr} /></div><Input value={st.attr ?? ""} onChange={(e) => updateStep(i, { attr: e.target.value })} placeholder="href for attrib_get, ::attr(href)" /></div>
                    <div className="space-y-1"><Label>identifier (adaptive)</Label><Input value={st.identifier ?? ""} onChange={(e)=>updateStep(i,{identifier:e.target.value})} placeholder="my_element" /><FieldHelp>Custom id for adaptive save/retrieve</FieldHelp></div>
                    <div className="space-y-1"><Label>percentage (adaptive)</Label><Input type="number" value={st.percentage ?? 40} onChange={(e)=>updateStep(i,{percentage:parseInt(e.target.value||"40",10)})} /><FieldHelp>Threshold % for adaptive relocate.</FieldHelp></div>
                    <div className="space-y-1"><Label>similarity_threshold (find_similar)</Label><Input type="number" step="0.1" value={st.similarity_threshold ?? 0.2} onChange={(e)=>updateStep(i,{similarity_threshold:parseFloat(e.target.value||"0.2")})} /><FieldHelp>0.0–1.0, low = more matches</FieldHelp></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!st.first_only} onChange={(e) => updateStep(i, { first_only: e.target.checked })} /> first_only<InfoTooltip content={helpTexts.parse.fields.firstOnly} /></label>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!st.adaptive} onChange={(e) => updateStep(i, { adaptive: e.target.checked })} /> adaptive<InfoTooltip content="Use adaptive relocate for this step" /></label>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!st.auto_save} onChange={(e) => updateStep(i, { auto_save: e.target.checked })} /> auto_save</label>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={!!st.partial} onChange={(e) => updateStep(i, { partial: e.target.checked })} /> partial<InfoTooltip content="For find_by_text – substring match" /></label>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={st.case_sensitive ?? true} onChange={(e) => updateStep(i, { case_sensitive: e.target.checked })} /> case_sensitive</label>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => setSteps((s) => [...s, { method: "css", selector: "" }])}>Add step</Button>
                <Button onClick={() => parseMut.mutate()} disabled={parseMut.isPending}>{parseMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing…</> : "Test selectors"}</Button>
                <Button variant="outline" onClick={() => treeMut.mutate()} disabled={treeMut.isPending}>{treeMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading…</> : "Show page structure"}</Button>
              </div>
              <div className="flex gap-2 flex-wrap items-center border rounded p-3 bg-muted/20">
                <Button
                  onClick={() => {
                    const fields = steps.filter((s) => s.selector?.trim()).map((s, i) => ({
                      name: `field_${i + 1}`,
                      steps: [{ method: s.method, selector: s.selector ?? "", ...(s.attr ? { attr: s.attr } : {}) }],
                    }));
                    const payload = fields.length ? fields : [{ name: "result", steps: steps.map((s) => ({ method: s.method, selector: s.selector ?? "" })) }];
                    navigate("/jobs/new", { state: { fields: payload, html } });
                  }}
                >
                  Use selectors in new list →
                </Button>
                <InfoTooltip content="Sends these selectors to New List — columns pre-filled, no copy-paste" />
                <FieldHelp>No copy-paste — selectors travel automatically to the list builder.</FieldHelp>
              </div>
              <AnimatePresence>
                {err && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</motion.div>}
              </AnimatePresence>

              <AnimatePresence>
                {results.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                    <Label>Test results</Label>
                    <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[260px]">{JSON.stringify(results, null, 2)}</pre>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => {
                        const v = prompt("Save selector name?");
                        if (v) saveMut.mutate({ name: v, target_url: "https://example.com", selector_spec: { steps }, auto_save: false });
                      }}>Save to library</Button>
                      <Button size="sm" onClick={() => {
                        const fields = steps.filter((s) => s.selector?.trim()).map((s, i) => ({
                          name: `field_${i + 1}`,
                          steps: [{ method: s.method, selector: s.selector ?? "" }],
                        }));
                        navigate("/jobs/new", { state: { fields: fields.length ? fields : [{ name: "result", steps }], html } });
                      }}>Use in new list →</Button>
                    </div>
                    <FieldHelp>Happy with the test? Send straight to a new list or save for reuse.</FieldHelp>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tree" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Page structure</CardTitle><CardDescription>See tags &amp; class names to pick selectors — no dev tools needed.</CardDescription></CardHeader>
            <CardContent>
              <div className="h-[500px] overflow-auto border rounded p-1 text-xs font-mono space-y-0.5">
                {(tree as unknown[]).slice(0, 800).map((n: unknown, i) => {
                  const node = n as Record<string, unknown>;
                  return <div key={i} className="truncate border-b py-0.5" style={{ paddingLeft: `${Math.min(32, ((node.depth as number) || 0) * 12)}px` }}>{String(node.tag)} {node.id ? `#${node.id}` : ""} {node.class ? `.${String(node.class).slice(0, 30)}` : ""} — {String(node.text_preview ?? "").slice(0, 60)}</div>;
                })}
                {!tree.length && <span className="text-muted-foreground">Press “Show page structure” to preview tags &amp; classes.</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Saved selectors</CardTitle><CardDescription>Reusable “how to grab X” recipes. Build above, save here, reuse in lists.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Target</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(selectorsQ.data as unknown[])?.map((r: unknown, idx: number) => {
                    const row = r as Record<string, unknown>;
                    return <motion.tr key={String(row.id)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="border-b transition-colors hover:bg-muted/50"><TableCell>{String(row.id)}</TableCell><TableCell>{String(row.name)}</TableCell><TableCell className="truncate max-w-[160px]">{String(row.target_url)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={async () => { await apiFetch(`/selectors/${row.id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["selectors"] }); }}>Delete</Button></TableCell></motion.tr>;
                  })}
                </TableBody>
              </Table>
              {!(selectorsQ.data as unknown[])?.length && <div className="text-sm text-muted-foreground mt-2">No saved selectors – build in playground and Save.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="helpers" className="space-y-4">
          <PageHelp title="Parse helpers — small tools" description="Each card calls a POST /parse/* helper directly. Paste HTML once in the Playground, then reuse it here." tips={["Pagination finds next-page links.", "Schemas reads JSON-LD / OpenGraph.", "Regex builds a pattern from matched text."]} />
          <div className="grid md:grid-cols-2 gap-4">
            <PaginationHelper defaultHtml={html} />
            <SchemasHelper defaultHtml={html} />
            <AnalyzeHelper defaultHtml={html} />
            <RegexHelper defaultHtml={html} />
            <ConvertHelper />
            <CurlHelper />
            <TextUtilsHelper />
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function HelperShell({ title, endpoint, children, result, error, pending }: { title: string; endpoint: string; children: React.ReactNode; result: unknown; error: string | null; pending: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-1 text-base">{title} <InfoTooltip content={`POST ${endpoint}`} /></CardTitle><CardDescription className="font-mono text-xs">{endpoint}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {children}
        <AnimatePresence>{error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</motion.div>}</AnimatePresence>
        {result != null && <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[240px]">{JSON.stringify(result, null, 2).slice(0, 12000)}</pre>}
        {pending && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running…</div>}
      </CardContent>
    </Card>
  );
}

function PaginationHelper({ defaultHtml }: { defaultHtml: string }) {
  const [htmlIn, setHtmlIn] = React.useState("");
  const [url, setUrl] = React.useState("https://example.com");
  const [strategy, setStrategy] = React.useState("auto");
  const [strict, setStrict] = React.useState(false);
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/pagination", { method: "POST", body: JSON.stringify({ html: htmlIn || defaultHtml, url: url || undefined, strategy, strict }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Pagination" endpoint="/parse/pagination" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><div className="flex items-center gap-1"><Label>HTML (blank = use playground)</Label><InfoTooltip content="Page source to scan for pagination links." /></div><Textarea value={htmlIn} onChange={(e) => setHtmlIn(e.target.value)} rows={3} placeholder="Leave blank to reuse playground HTML" /></div>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1"><Label>URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" /></div>
      <div className="space-y-1"><Label>Strategy</Label><Select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="auto">auto</option><option value="selector">selector</option><option value="heuristic">heuristic</option></Select></div>
    </div>
    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> strict</label>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Find pagination</Button>
  </HelperShell>;
}

function SchemasHelper({ defaultHtml }: { defaultHtml: string }) {
  const [htmlIn, setHtmlIn] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/schemas", { method: "POST", body: JSON.stringify({ html: htmlIn || defaultHtml, url: url || undefined }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Schemas" endpoint="/parse/schemas" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><div className="flex items-center gap-1"><Label>HTML (blank = use playground)</Label><InfoTooltip content="Page source to scan for JSON-LD, microdata, OpenGraph." /></div><Textarea value={htmlIn} onChange={(e) => setHtmlIn(e.target.value)} rows={3} placeholder="Leave blank to reuse playground HTML" /></div>
    <div className="space-y-1"><Label>URL (optional)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" /></div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Extract schemas</Button>
  </HelperShell>;
}

function AnalyzeHelper({ defaultHtml }: { defaultHtml: string }) {
  const [htmlIn, setHtmlIn] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/analyze", { method: "POST", body: JSON.stringify({ html: htmlIn || defaultHtml, url: url || undefined }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Analyze" endpoint="/parse/analyze" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><div className="flex items-center gap-1"><Label>HTML (blank = use playground)</Label><InfoTooltip content="Page source to analyze (Selector.analyze report)." /></div><Textarea value={htmlIn} onChange={(e) => setHtmlIn(e.target.value)} rows={3} placeholder="Leave blank to reuse playground HTML" /></div>
    <div className="space-y-1"><Label>URL (optional)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" /></div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Analyze page</Button>
  </HelperShell>;
}

function RegexHelper({ defaultHtml }: { defaultHtml: string }) {
  const [htmlIn, setHtmlIn] = React.useState("");
  const [css, setCss] = React.useState("h1");
  const [attr, setAttr] = React.useState("text");
  const [anchored, setAnchored] = React.useState(true);
  const [captureGroups, setCaptureGroups] = React.useState(false);
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/regex", { method: "POST", body: JSON.stringify({ html: htmlIn || defaultHtml, css, attr, flags: 0, anchored, capture_groups: captureGroups }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Regex builder" endpoint="/parse/regex" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><Label>HTML (blank = use playground)</Label><Textarea value={htmlIn} onChange={(e) => setHtmlIn(e.target.value)} rows={3} placeholder="Leave blank to reuse playground HTML" /></div>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1"><div className="flex items-center gap-1"><Label>CSS</Label><InfoTooltip content="Selector whose text seeds the regex, e.g. h1.title" /></div><Input value={css} onChange={(e) => setCss(e.target.value)} /></div>
      <div className="space-y-1"><div className="flex items-center gap-1"><Label>Attr</Label><InfoTooltip content="text or an attribute like href" /></div><Input value={attr} onChange={(e) => setAttr(e.target.value)} /></div>
    </div>
    <div className="flex gap-3 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={anchored} onChange={(e) => setAnchored(e.target.checked)} /> anchored</label><label className="flex items-center gap-1"><input type="checkbox" checked={captureGroups} onChange={(e) => setCaptureGroups(e.target.checked)} /> capture_groups</label></div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Generate regex</Button>
  </HelperShell>;
}

function ConvertHelper() {
  const [selector, setSelector] = React.useState("h1.title");
  const [from, setFrom] = React.useState("css");
  const [target, setTarget] = React.useState("xpath");
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/convert-selector", { method: "POST", body: JSON.stringify({ selector, from, target }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Convert selector" endpoint="/parse/convert-selector" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-1"><div className="flex items-center gap-1"><Label>Selector</Label><InfoTooltip content="CSS or XPath to convert, e.g. h1.title or //h1" /></div><Input value={selector} onChange={(e) => setSelector(e.target.value)} /></div>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1"><Label>From</Label><Select value={from} onChange={(e) => setFrom(e.target.value)}><option value="css">css</option><option value="xpath">xpath</option></Select></div>
      <div className="space-y-1"><Label>Target</Label><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="xpath">xpath</option><option value="css">css</option></Select></div>
    </div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Convert</Button>
  </HelperShell>;
}

function CurlHelper() {
  const [curl, setCurl] = React.useState("curl 'https://example.com' -H 'Accept: */*'");
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/curl-parse", { method: "POST", body: JSON.stringify({ curl }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Curl parse" endpoint="/parse/curl-parse" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><div className="flex items-center gap-1"><Label>Curl command</Label><InfoTooltip content="Paste a curl command copied from DevTools — we split out method, URL, headers, cookies." /></div><Textarea value={curl} onChange={(e) => setCurl(e.target.value)} rows={4} /></div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Parse curl</Button>
  </HelperShell>;
}

function TextUtilsHelper() {
  const [text, setText] = React.useState("  hello   world  ");
  const [op, setOp] = React.useState("clean_spaces");
  const [separator, setSeparator] = React.useState(" ");
  const [out, setOut] = React.useState<unknown>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => apiFetch("/parse/text-utils", { method: "POST", body: JSON.stringify({ text, op, separator }) }),
    onSuccess: (d) => { setOut(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  return <HelperShell title="Text utils" endpoint="/parse/text-utils" result={out} error={err} pending={mut.isPending}>
    <div className="space-y-2"><div className="flex items-center gap-1"><Label>Text</Label><InfoTooltip content="Input text: clean_spaces collapses whitespace, flatten joins, word_count counts, lines splits." /></div><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} /></div>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1"><Label>Op</Label><Select value={op} onChange={(e) => setOp(e.target.value)}><option value="clean_spaces">clean_spaces</option><option value="flatten">flatten</option><option value="word_count">word_count</option><option value="lines">lines</option></Select></div>
      <div className="space-y-1"><Label>Separator (flatten)</Label><Input value={separator} onChange={(e) => setSeparator(e.target.value)} /></div>
    </div>
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>Run</Button>
  </HelperShell>;
}
