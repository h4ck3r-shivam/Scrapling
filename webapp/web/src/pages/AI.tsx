import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function AIPage() {
  const [url, setUrl] = React.useState("https://example.com");
  const [css, setCss] = React.useState("");
  const [mainOnly, setMainOnly] = React.useState(true);
  const [markdown, setMarkdown] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const [mcpInfo, setMcpInfo] = React.useState<Record<string, unknown> | null>(null);

  const fetchMd = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ markdown?: string; markdown_error?: string; html_content: string } & Record<string, unknown>>("/fetch", {
        method: "POST",
        body: JSON.stringify({ url, engine: "static", markdown_output: true, main_content_only: mainOnly, css_selector: css || undefined }),
      });
      // backend fetch with markdown_output populates markdown via response.markdown(css_selector, main_content_only)
      // our /fetch returns direct markdown field
      return res;
    },
    onSuccess: (d) => { setMarkdown((d as unknown as { markdown?: string }).markdown ?? "No markdown returned"); setErr(null); },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const mcpMut = useMutation({
    mutationFn: () => apiFetch<Record<string, unknown>>("/system/mcp/start", { method: "POST" }),
    onSuccess: (d) => setMcpInfo(d),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  // SiteToMarkdown job helper
  const [siteUrl, setSiteUrl] = React.useState("https://example.com");
  const [allowed, setAllowed] = React.useState("example.com");
  const [maxPages, setMaxPages] = React.useState(5);

  const siteJobMut = useMutation({
    mutationFn: () =>
      apiFetch("/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: `SiteToMarkdown ${siteUrl}`,
          kind: "crawl",
          engine: "static",
          template: "site_to_markdown",
          spec: {
            template: "site_to_markdown",
            engine: "static",
            settings: { start_urls: [siteUrl], allowed_domains: allowed.split(",").map((s) => s.trim()).filter(Boolean) },
            template_config: { allowed_domains: allowed.split(",").map((s) => s.trim()).filter(Boolean), css_selector: css || null, main_content_only: mainOnly, max_pages: maxPages },
            export_formats: ["json"],
          },
        }),
      }),
    onSuccess: () => setErr(null),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold">AI helpers</motion.h1>
      <PageHelp title={helpTexts.ai.title} description={helpTexts.ai.description} tips={helpTexts.ai.tips} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="grid md:grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader><CardTitle>MCP server — POST /api/system/mcp/start → 8017</CardTitle><CardDescription>Chaan-Been MCP HTTP on 8017 with auth token; config_hint for Cursor/Claude.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => mcpMut.mutate()} disabled={mcpMut.isPending}>{mcpMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting…</> : "Start MCP"}</Button>
            <AnimatePresence>
              {mcpInfo && <motion.pre initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-muted p-2 rounded text-xs overflow-auto">{JSON.stringify(mcpInfo, null, 2)}</motion.pre>}
              {mcpMut.isError && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-destructive">{String((mcpMut.error as Error).message)} — set SCC_MCP_ENABLED=true in env.</motion.div>}
            </AnimatePresence>
            <p className="text-xs text-muted-foreground">Server runs <code>python -m scrapling.cli mcp --http --host 127.0.0.1 --port 8017 --auth-token &lt;token&gt;</code> and streams logs via /ws/system.</p>
          </CardContent>
        </Card></motion.div>

        <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}><Card className="h-full">
          <CardHeader><CardTitle>SiteToMarkdown preview — response.markdown(css_selector, main_content_only)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div><Label>css_selector (optional)</Label><Input value={css} onChange={(e) => setCss(e.target.value)} placeholder="article" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} /> main_content_only</label>
            <Button onClick={() => fetchMd.mutate()} disabled={fetchMd.isPending}>{fetchMd.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching…</> : "Fetch + markdown (POST /api/fetch)"}</Button>
            <AnimatePresence>{markdown && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border rounded overflow-hidden" style={{ height: 200 }}><Editor height="200px" language="markdown" value={markdown.slice(0, 20000)} options={{ readOnly: true, minimap: { enabled: false } }} /></motion.div>}</AnimatePresence>
          </CardContent>
        </Card></motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardHeader><CardTitle>SiteToMarkdown spider job — template site_to_markdown</CardTitle><CardDescription>Creates a Job with MarkdownSiteTemplateConfig (allowed_domains, css_selector, main_content_only, max_pages) then run via Jobs page.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <div><Label>Start URL</Label><Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} /></div>
              <div><Label>Allowed domains (comma)</Label><Input value={allowed} onChange={(e) => setAllowed(e.target.value)} /></div>
              <div><Label>Max pages</Label><Input type="number" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value || "0", 10))} /></div>
            </div>
            <Button onClick={() => siteJobMut.mutate()} disabled={siteJobMut.isPending}>{siteJobMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create SiteToMarkdown job (POST /jobs)"}</Button>
            <AnimatePresence>
              {siteJobMut.isSuccess && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-green-600">Job created — go to Jobs list to start and stream via WS.</motion.div>}
              {err && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</motion.div>}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
