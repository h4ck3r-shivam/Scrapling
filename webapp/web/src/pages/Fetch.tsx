import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { FetchResult } from "@/lib/api";
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

export default function FetchPage() {
  const navigate = useNavigate();
  const [url, setUrl] = React.useState("https://example.com");
  const [method, setMethod] = React.useState<"GET" | "POST">("GET");
  const [engine, setEngine] = React.useState<"static" | "dynamic" | "stealth">("static");
  const [timeout, setTimeout] = React.useState("");
  const [pageAction, setPageAction] = React.useState("async def action(page):\n    await page.wait_for_timeout(1000)\n");
  const [solveCf, setSolveCf] = React.useState(false);
  const [markdown, setMarkdown] = React.useState(false);
  const [mainContentOnly, setMainContentOnly] = React.useState(true);
  // Advanced per-call overrides
  const [wait, setWait] = React.useState("");
  const [waitSelector, setWaitSelector] = React.useState("");
  const [waitSelectorState, setWaitSelectorState] = React.useState("attached");
  const [networkIdle, setNetworkIdle] = React.useState(false);
  const [loadDom, setLoadDom] = React.useState(true);
  const [disableResources, setDisableResources] = React.useState(false);
  const [googleSearch, setGoogleSearch] = React.useState(true);
  const [extraHeadersJson, setExtraHeadersJson] = React.useState('{\n  "X-Custom": "value"\n}');
  const [blockedDomainsJson, setBlockedDomainsJson] = React.useState('[]');
  const [cookiesJson, setCookiesJson] = React.useState('[]');
  const [proxyOverride, setProxyOverride] = React.useState("");
  // Static specific
  const [staticJson, setStaticJson] = React.useState('{\n  "impersonate": "chrome",\n  "stealthy_headers": true,\n  "retries": 3,\n  "follow_redirects": "safe"\n}');
  const [browserJson, setBrowserJson] = React.useState('{\n  "headless": true,\n  "block_ads": false,\n  "disable_resources": false\n}');
  const [paramsJson, setParamsJson] = React.useState('{}');
  const [dataRaw, setDataRaw] = React.useState("");
  const [jsonBody, setJsonBody] = React.useState("");
  const [res, setRes] = React.useState<FetchResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  // Batch mode (POST /fetch/batch)
  const [mode, setMode] = React.useState<"single" | "batch">("single");
  const [batchUrls, setBatchUrls] = React.useState("https://example.com\nhttps://example.org");
  const [batchConcurrency, setBatchConcurrency] = React.useState("5");
  const [batchRes, setBatchRes] = React.useState<{ results: Record<string, unknown>[] } | null>(null);
  const [batchErr, setBatchErr] = React.useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      let static_config: Record<string, unknown> | undefined;
      let dynamic_config: Record<string, unknown> | undefined;
      let extra_headers: Record<string, string> | undefined;
      let blocked_domains: string[] | undefined;
      try { if (extraHeadersJson.trim()) extra_headers = JSON.parse(extraHeadersJson); } catch (e) { throw new Error("extra_headers JSON invalid: " + String(e)); }
      try { if (blockedDomainsJson.trim()) blocked_domains = JSON.parse(blockedDomainsJson); } catch (e) { throw new Error("blocked_domains JSON invalid: " + String(e)); }
      try { if (engine === "static" && staticJson.trim()) static_config = JSON.parse(staticJson); } catch (e) { throw new Error("static_config JSON invalid: " + String(e)); }
      try { if (engine !== "static" && browserJson.trim()) dynamic_config = JSON.parse(browserJson); } catch (e) { throw new Error("dynamic_config JSON invalid: " + String(e)); }
      if (pageAction.trim() && engine !== "static") {
        dynamic_config = { ...(dynamic_config || {}), page_action: pageAction };
      }
      // Merge per-call overrides into dynamic_config for browser, or top-level for fetch spec
      const body: Record<string, unknown> = { url, method, engine, markdown_output: markdown, main_content_only: mainContentOnly };
      if (timeout) body.timeout = Number(timeout);
      if (wait) body.wait = Number(wait);
      if (waitSelector) { body.wait_selector = waitSelector; body.wait_selector_state = waitSelectorState; }
      if (networkIdle) body.network_idle = true;
      if (!loadDom) body.load_dom = false;
      if (disableResources) body.disable_resources = true;
      if (!googleSearch) body.google_search = false;
      if (extra_headers) body.extra_headers = extra_headers;
      if (blocked_domains) body.blocked_domains = blocked_domains;
      if (solveCf) body.solve_cloudflare = true;
      if (proxyOverride) body.proxy = proxyOverride;
      // Static per-call
      try { if (paramsJson.trim() && paramsJson !== "{}") body.params = JSON.parse(paramsJson); } catch (e) { throw new Error("params JSON invalid: " + String(e)); }
      if (cookiesJson.trim() && cookiesJson !== "[]") {
        try { body.cookies = JSON.parse(cookiesJson); } catch (e) { throw new Error("cookies JSON invalid: " + String(e)); }
      }
      if (dataRaw.trim()) body.data = dataRaw;
      if (jsonBody.trim()) {
        try { body.json = JSON.parse(jsonBody); } catch (e) { throw new Error("json body invalid: " + String(e)); }
      }
      if (static_config) body.static_config = static_config;
      if (dynamic_config) body.dynamic_config = dynamic_config;
      return apiFetch<FetchResult>("/fetch", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (d) => { setRes(d); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const batchMut = useMutation({
    mutationFn: async () => {
      const urls = batchUrls.split("\n").map((u) => u.trim()).filter(Boolean);
      if (!urls.length) throw new Error("Enter at least one URL (one per line)");
      if (urls.length > 50) throw new Error("Max 50 URLs per batch");
      const concurrency = Math.max(1, Math.min(20, Number(batchConcurrency) || 5));
      return apiFetch<{ results: Record<string, unknown>[] }>("/fetch/batch", {
        method: "POST",
        body: JSON.stringify({ urls, engine, concurrency }),
      });
    },
    onSuccess: (d) => { setBatchRes(d); setBatchErr(null); },
    onError: (e: unknown) => setBatchErr(e instanceof Error ? e.message : String(e)),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold">Fetch console — test one page</motion.h1>
      <PageHelp title="Try one page before building a list" description={helpTexts.fetch.description} tips={[...helpTexts.fetch.tips, "After fetching, press Send to Parse playground to build selectors — no copy-paste needed.", "Batch mode fetches up to 50 URLs at once via POST /fetch/batch."]} />
      <div className="flex gap-2">
        <Button variant={mode === "single" ? "default" : "outline"} size="sm" onClick={() => setMode("single")}>Single</Button>
        <Button variant={mode === "batch" ? "default" : "outline"} size="sm" onClick={() => setMode("batch")}>Batch</Button>
        <InfoTooltip content="Single fetches one URL (POST /fetch). Batch fetches up to 50 URLs concurrently (POST /fetch/batch)." />
      </div>
      {mode === "batch" && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1">Batch fetch — POST /fetch/batch <InfoTooltip content="Fetch up to 50 URLs at once. Each entry shares the engine. Concurrency caps at 20." /></CardTitle><CardDescription>One URL per line, max 50. Results show per-URL status or error.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center gap-1"><Label>URLs (one per line)</Label><InfoTooltip content="Each line is fetched as its own request, e.g. https://example.com/page/1" /></div>
                <Textarea value={batchUrls} onChange={(e) => setBatchUrls(e.target.value)} rows={8} placeholder={"https://example.com\nhttps://example.org"} />
                <FieldHelp>Max 50 URLs — empty lines are ignored.</FieldHelp>
              </div>
              <div className="space-y-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Engine</Label><InfoTooltip content={helpTexts.fetch.fields.engine} /></div><Select value={engine} onChange={(e) => setEngine(e.target.value as never)}><option value="static">static (curl_cffi)</option><option value="dynamic">dynamic (playwright)</option><option value="stealth">stealth (patchright)</option></Select></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Concurrency (1–20)</Label><InfoTooltip content="How many fetches run at once. Higher is faster but more load." /></div><Input type="number" min={1} max={20} value={batchConcurrency} onChange={(e) => setBatchConcurrency(e.target.value)} /><FieldHelp>Server clamps to 1–20.</FieldHelp></div>
                <Button onClick={() => batchMut.mutate()} disabled={batchMut.isPending}>{batchMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching…</> : "Fetch batch"}</Button>
              </div>
            </div>
            <AnimatePresence>{batchErr && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{batchErr}</motion.div>}</AnimatePresence>
            {batchRes && (
              <div className="space-y-2">
                <Label>Results ({batchRes.results.length})</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Status</TableHead><TableHead>Result / Error</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {batchRes.results.map((r, i) => (
                      <TableRow key={i}><TableCell className="font-mono text-xs break-all max-w-[280px]">{String(r.url ?? `row ${i}`)}</TableCell><TableCell>{r.error ? <span className="text-destructive text-xs">{String(r.error).slice(0, 120)}</span> : <span className="text-xs">{String((r as Record<string, unknown>).status ?? "ok")}</span>}</TableCell><TableCell className="font-mono text-xs truncate max-w-[360px]">{r.error ? String(r.error) : `${String((r as Record<string, unknown>).reason ?? "")} · ${(r as { html_content?: string }).html_content?.length ?? (r as { text?: string }).text?.length ?? 0} chars`}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                <details><summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary><pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[300px]">{JSON.stringify(batchRes, null, 2).slice(0, 20000)}</pre></details>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {mode === "single" && (<Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="browser">Browser</TabsTrigger>
          <TabsTrigger value="headers">Headers & Cookies</TabsTrigger>
          <TabsTrigger value="advanced">Advanced JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Basic request</CardTitle><CardDescription>What to fetch and how. Try here before building a list.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2"><div className="flex items-center gap-1"><Label>URL</Label><InfoTooltip content={helpTexts.fetch.fields.url} /></div><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/product/123" /><FieldHelp>{helpTexts.fetch.fields.url}</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Method</Label><InfoTooltip content={helpTexts.fetch.fields.method} /></div><Select value={method} onChange={(e) => setMethod(e.target.value as never)}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></Select><FieldHelp>GET = view page, POST/PUT for forms/APIs.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Engine</Label><InfoTooltip content={helpTexts.fetch.fields.engine} /></div><Select value={engine} onChange={(e) => setEngine(e.target.value as never)}><option value="static">static (curl_cffi)</option><option value="dynamic">dynamic (playwright)</option><option value="stealth">stealth (patchright)</option></Select><FieldHelp>{helpTexts.engines.fields[engine === "static" ? "static" : engine === "dynamic" ? "dynamic" : "stealth"]}</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Timeout</Label><InfoTooltip content={helpTexts.fetch.fields.timeout} /></div><Input value={timeout} onChange={(e) => setTimeout(e.target.value)} placeholder="30000 ms browser / 30 s static" /><FieldHelp>Browser 30000 ms, static 30 s. Leave blank for default.</FieldHelp></div>
                <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={solveCf} onChange={(e) => setSolveCf(e.target.checked)} /><Label>solve_cloudflare (stealth)</Label><InfoTooltip content={helpTexts.fetch.fields.solveCloudflare} /></div>
                <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={markdown} onChange={(e) => setMarkdown(e.target.checked)} /><Label>markdown_output</Label><InfoTooltip content={helpTexts.fetch.fields.markdown} /></div>
                {markdown && <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={mainContentOnly} onChange={(e) => setMainContentOnly(e.target.checked)} /><Label>main_content_only</Label><InfoTooltip content={helpTexts.ai.fields.mainContentOnly} /></div>}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Wait (ms)</Label><InfoTooltip content="Extra wait after page load before returning – e.g., 2000 for animations" /></div><Input value={wait} onChange={(e)=>setWait(e.target.value)} placeholder="0" /><FieldHelp>Browser only – extra pause after load.</FieldHelp></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Wait selector</Label><InfoTooltip content="Wait for this CSS to appear before returning – e.g., h1.title" /></div><Input value={waitSelector} onChange={(e)=>setWaitSelector(e.target.value)} placeholder="h1" /><FieldHelp>Browser only – e.g., .product . Waits for attached/visible.</FieldHelp></div>
                {waitSelector && <div className="space-y-2"><Label>Wait selector state</Label><Select value={waitSelectorState} onChange={(e)=>setWaitSelectorState(e.target.value)}><option>attached</option><option>visible</option><option>hidden</option><option>detached</option></Select></div>}
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2"><input type="checkbox" checked={networkIdle} onChange={(e)=>setNetworkIdle(e.target.checked)} /><Label>network_idle</Label><InfoTooltip content="Wait until no network for 500ms – good for lazy-loaded prices" /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={loadDom} onChange={(e)=>setLoadDom(!e.target.checked)} /><Label>load_dom</Label><InfoTooltip content="Wait for DOMContentLoaded – uncheck to return faster (may miss JS)" /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={disableResources} onChange={(e)=>setDisableResources(e.target.checked)} /><Label>disable_resources</Label><InfoTooltip content="Block fonts/images/media for speed – uses EXTRA_RESOURCES blocklist" /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={googleSearch} onChange={(e)=>setGoogleSearch(e.target.checked)} /><Label>google_search referer</Label><InfoTooltip content="Send https://www.google.com/ as referer – looks like coming from Google" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="browser" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Browser per-call overrides</CardTitle><CardDescription>These override the session config for this one fetch – same keys as BrowserEngineConfig.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Extra headers JSON</Label><InfoTooltip content="Custom headers for this request – e.g., {&quot;X-Custom&quot;:&quot;value&quot;}" /></div><div className="border rounded overflow-hidden" style={{height:80}}><Editor height="80px" language="json" value={extraHeadersJson} onChange={(v)=>setExtraHeadersJson(v||"{}")} options={{minimap:{enabled:false}}} /></div></div>
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Blocked domains JSON</Label><InfoTooltip content="Block requests to these domains – e.g., [&quot;ads.example.com&quot;]" /></div><div className="border rounded overflow-hidden" style={{height:80}}><Editor height="80px" language="json" value={blockedDomainsJson} onChange={(v)=>setBlockedDomainsJson(v||"[]")} options={{minimap:{enabled:false}}} /></div></div>
                <div className="space-y-2"><Label>Proxy override (per-call)</Label><Input value={proxyOverride} onChange={(e)=>setProxyOverride(e.target.value)} placeholder="http://user:pass@host:8080 or empty for rotator" /><FieldHelp>Browser per-call proxy – overrides session proxy.</FieldHelp></div>
                <div className="space-y-2"><Label>Cookies JSON</Label><div className="border rounded overflow-hidden" style={{height:80}}><Editor height="80px" language="json" value={cookiesJson} onChange={(v)=>setCookiesJson(v||"[]")} options={{minimap:{enabled:false}}} /></div><FieldHelp>Array of key/value — e.g. [{`{"key":"a","value":"b"}`}]. name/value also accepted.</FieldHelp></div>
              </div>
              {engine !== "static" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1"><Label>page_action (python)</Label><InfoTooltip content={helpTexts.fetch.fields.pageAction} /></div>
                  <div className="border rounded overflow-hidden" style={{ height: 140 }}><Editor height="140px" language="python" value={pageAction} onChange={(v) => setPageAction(v || "")} options={{ minimap: { enabled: false } }} /></div><FieldHelp>Example: await page.click('button.accept'); await page.wait_for_timeout(2000)</FieldHelp>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="headers" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Static per-call: params, cookies, auth, data</CardTitle><CardDescription>Only for static engine (curl_cffi) – browser ignores these.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Params JSON (query string)</Label><div className="border rounded overflow-hidden" style={{height:80}}><Editor height="80px" language="json" value={paramsJson} onChange={(v)=>setParamsJson(v||"{}")} options={{minimap:{enabled:false}}} /></div><FieldHelp>{"{ \"q\": \"search\" } → ?q=search"}</FieldHelp></div>
                <div className="space-y-2"><Label>JSON body</Label><div className="border rounded overflow-hidden" style={{height:80}}><Editor height="80px" language="json" value={jsonBody} onChange={(v)=>setJsonBody(v||"")} options={{minimap:{enabled:false}}} /></div></div>
                <div className="space-y-2 md:col-span-2"><Label>Data raw (form data)</Label><Textarea value={dataRaw} onChange={(e)=>setDataRaw(e.target.value)} placeholder="key=value&foo=bar or raw string" /><FieldHelp>Sent as data for POST/PUT.</FieldHelp></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Advanced options</CardTitle><CardDescription>Full options for power users.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {engine === "static" ? (
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>static_config JSON</Label><InfoTooltip content={helpTexts.fetch.fields.staticConfig} /></div><div className="border rounded overflow-hidden" style={{ height: 200 }}><Editor height="200px" language="json" value={staticJson} onChange={(v) => setStaticJson(v || "{}")} options={{ minimap: { enabled: false } }} /></div><FieldHelp>Keys: impersonate, http3, stealthy_headers, timeout, headers, retries, retry_delay, follow_redirects, max_redirects, verify, cert, proxies, proxy, proxy_auth, proxy_group_id, selector_config.</FieldHelp></div>
              ) : (
                <div className="space-y-2"><div className="flex items-center gap-1"><Label>Browser config JSON</Label><InfoTooltip content={helpTexts.fetch.fields.browserConfig} /></div><div className="border rounded overflow-hidden" style={{ height: 200 }}><Editor height="200px" language="json" value={browserJson} onChange={(v) => setBrowserJson(v || "{}")} options={{ minimap: { enabled: false } }} /></div><FieldHelp>Keys: max_pages, headless, disable_resources, network_idle, load_dom, wait_selector, cookies, google_search, wait, timezone_id, page_action, proxy, extra_headers, timeout, init_script, user_data_dir, locale, real_chrome, cdp_url, useragent, extra_flags, blocked_domains, block_ads, retries, capture_xhr, executable_path, dns_over_https + stealth: allow_webgl, hide_canvas, block_webrtc, solve_cloudflare.</FieldHelp></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>)}

      {mode === "single" && (<div className="flex gap-2">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching…</> : "Fetch"}</Button>
        <AnimatePresence>{err && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded flex-1">{err}</motion.div>}</AnimatePresence>
      </div>)}

      <AnimatePresence>
        {mode === "single" && res && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-1">Page result — {res.status} {res.reason} <InfoTooltip content="What the site returned. Send the HTML to Parse playground to build selectors in one click." /></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <PageHelp title="Next step — build selectors" description="Got the page? Send its HTML to the Parse playground to test what to collect — no copy-paste." tips={["Press Send HTML to Parse — HTML travels automatically.", "In Parse, test selectors, then Use in New List."]} />
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                onClick={() => navigate("/parse", { state: { html: res.html_content || res.text || "", url } })}
                title="Send this HTML to Parse playground"
              >
                Send HTML to Parse →
              </Button>
              <InfoTooltip content="Opens Parse playground with this HTML pre-filled" />
              <FieldHelp>No copy-paste needed — HTML travels automatically.</FieldHelp>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div><strong>Headers</strong><pre className="bg-muted p-2 rounded overflow-auto max-h-[200px]">{JSON.stringify(res.response_headers, null, 2)}</pre></div>
              <div><strong>Meta</strong><pre className="bg-muted p-2 rounded overflow-auto max-h-[200px]">{JSON.stringify({ encoding: res.encoding, body_size: res.body_size, pool_stats: res.pool_stats }, null, 2)}</pre></div>
            </div>
            {res.markdown && <div><Label>Markdown (main_content_only={String(mainContentOnly)})</Label><pre className="bg-muted p-2 rounded overflow-auto max-h-[300px] text-xs whitespace-pre-wrap">{res.markdown.slice(0, 8000)}</pre></div>}
            <div><Label>HTML content ({res.html_content?.length ?? 0} chars)</Label>
              <div className="border rounded overflow-hidden" style={{ height: 320 }}><Editor height="320px" language="html" value={(res.html_content || res.text || "").slice(0, 200000)} options={{ readOnly: true, minimap: { enabled: false } }} /></div>
            </div>
          </CardContent>
        </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
