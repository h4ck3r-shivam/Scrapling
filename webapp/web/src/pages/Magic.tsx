import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type MagicMode = "list" | "single" | "crawl";

/** Convert a raw WS / progress event into a human sentence for telecallers. No JSON. */
export function humanizeMagicEvent(d: Record<string, unknown>): string {
  const t = String(d.type ?? d.status ?? d.event ?? "");
  const count =
    (d.found as number | undefined) ??
    (d.items_count as number | undefined) ??
    (d.count as number | undefined) ??
    (d.total as number | undefined);
  const page = (d.page as number | undefined) ?? (d.pages_visited as number | undefined);
  const totalPages = (d.total_pages as number | undefined) ?? (d.max_pages as number | undefined);
  const url = (d.url as string | undefined) ?? (d.current_url as string | undefined) ?? "";
  const name = (d.name as string | undefined) ?? ((d.item as Record<string, unknown> | undefined)?.name as string | undefined) ?? "";

  if (t === "item" || d.item) {
    if (name) return `Found 1 company — ${name}. Saved to your list.`;
    return `Found 1 company. Saved to your list.`;
  }
  if (t.includes("scroll")) {
    if (page && totalPages) return `Scrolling results… page ${page} of ${totalPages}. Keep this tab open.`;
    if (page) return `Scrolling results… page ${page}. Looking for more companies.`;
    return `Scrolling results to find more companies…`;
  }
  if (t.includes("progress") || t.includes("status")) {
    if (typeof count === "number" && count > 0) return `Found ${count} companies so far. Still collecting…`;
    if (url) return `Visiting ${url}…`;
    return `Working… collecting companies for you.`;
  }
  if (t === "done" || t.includes("complete") || t.includes("finish")) {
    if (typeof count === "number") return `Done! Found ${count} companies. Download your CSV below.`;
    return `Done! Your list is ready. Download your CSV.`;
  }
  if (t.includes("error") || t.includes("fail") || d.error) {
    return `Hmm, hit a snag${url ? ` on ${url}` : ""}. Try stealth mode or fewer pages.`;
  }
  if (typeof count === "number" && count > 0) return `Found ${count} companies so far.`;
  return `Working… collecting your list.`;
}

export default function MagicPage() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<MagicMode>("list");
  const [url, setUrl] = React.useState("https://quotes.toscrape.com/");
  const [keyword, setKeyword] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [fieldsText, setFieldsText] = React.useState('title: css h1\nprice: css .price::text\nlink: css a::attr(href)');
  const [engine, setEngine] = React.useState<"static" | "dynamic" | "stealth">("static");
  const [maxPages, setMaxPages] = React.useState(5);
  const [follow, setFollow] = React.useState(true);
  const [name, setName] = React.useState("");
  const [createAndStart, setCreateAndStart] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [fieldsWarning, setFieldsWarning] = React.useState<string | null>(null);
  const [statusNote, setStatusNote] = React.useState<string | null>(null);
  const [liveFeed, setLiveFeed] = React.useState<string[]>([
    "Example: Scrolling results… page 2. Looking for more companies.",
    "Example: Found 12 companies so far. Still collecting…",
  ]);

  const isListMode = mode === "list";
  const isSingleMode = mode === "single";
  const isCrawlMode = mode === "crawl";

  function parseFields(): { name: string; steps: { method: string; selector: string }[] }[] {
    const warnings: string[] = [];
    const out = fieldsText.split("\n").map(l => l.trim()).filter(Boolean).map((line, idx) => {
      const colon = line.indexOf(":");
      if (colon === -1) {
        warnings.push(`Line ${idx + 1} (“${line}”) has no “:” — using whole line as field name and reading full page text. Add “: css selector” to be precise.`);
        return { name: line.trim() || `field_${idx + 1}`, steps: [{ method: "css", selector: "body" }] };
      }
      const fieldName = line.slice(0, colon).trim();
      const sel = line.slice(colon + 1).trim();
      if (!fieldName) {
        warnings.push(`Line ${idx + 1} is missing a field name before “:”. Please name it, e.g. “title: css h1”.`);
      }
      if (!sel) {
        warnings.push(`“${fieldName || `line ${idx + 1}`}” has no selector — falling back to full page text. Add a selector like “css h1” to grab exactly what you want.`);
        return { name: fieldName || `field_${idx + 1}`, steps: [{ method: "css", selector: "body" }] };
      }
      // allow "title: css h1" or "title: h1" (default css)
      if (sel.startsWith("css ") || sel.startsWith("xpath ") || sel.startsWith("find_")) {
        const [method, ...selParts] = sel.split(" ");
        const selector = selParts.join(" ").trim();
        if (!selector) {
          warnings.push(`“${fieldName}” lists a method but no selector — reading full page text instead.`);
          return { name: fieldName.trim(), steps: [{ method: method.trim(), selector: "body" }] };
        }
        return { name: fieldName.trim(), steps: [{ method: method.trim(), selector }] };
      }
      return { name: fieldName.trim(), steps: [{ method: "css", selector: sel }] };
    });
    setFieldsWarning(warnings.length ? warnings.join(" ") : null);
    return out;
  }

  function buildSpec(fields: { name: string; steps: { method: string; selector: string }[] }[]) {
    const startUrls = url.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const allowedDomains = startUrls.map(u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
    const uniqueDomains = Array.from(new Set(allowedDomains));

    if (isListMode || isCrawlMode) {
      // Use crawl template for lists/crawls
      return {
        template: "crawl" as const,
        engine,
        settings: {
          start_urls: startUrls,
          allowed_domains: uniqueDomains,
          concurrent_requests: 4,
          download_delay: 0.5,
          robots_txt_obey: false,
          autothrottle_enabled: true,
        },
        template_config: {
          fields,
          max_pages: maxPages,
          follow_links: follow,
          link_extractor: {
            allow: [],
            deny: [],
            allow_domains: uniqueDomains,
            restrict_css: [],
            tags: ["a", "area"],
            attrs: ["href"],
            canonicalize: true,
          }
        },
        export_formats: ["json", "csv"],
      };
    } else {
      // Single page - custom template
      return {
        template: "custom" as const,
        engine,
        settings: {
          start_urls: startUrls,
          allowed_domains: uniqueDomains,
        },
        template_config: {
          fields,
          follow_links: false,
        },
        export_formats: ["json"],
      };
    }
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const fields = parseFields();
      const spec = buildSpec(fields);
      const jobName = name.trim() || `${mode === "list" ? "List" : mode === "crawl" ? "Crawl" : "Single"} - ${url.split("/")[2] || "job"} - ${new Date().toLocaleDateString()}`;
      // Add keyword/location to name if provided (for generic search like insurance Kenya)
      const fullName = keyword ? `${jobName} - ${keyword}${location ? ` in ${location}` : ""}` : jobName;
      setStatusNote("Creating your list…");
      const created = await apiFetch<{ id: number }>("/jobs", {
        method: "POST",
        body: JSON.stringify({ name: fullName, kind: "crawl", engine, template: spec.template, spec }),
      });
      if (createAndStart) {
        setStatusNote(`Starting your list (job #${created.id})…`);
        setLiveFeed((prev) => [`Starting your list… visiting your link.`, ...prev].slice(0, 20));
        try {
          await apiFetch(`/jobs/${created.id}/start`, { method: "POST" });
          setLiveFeed((prev) => [humanizeMagicEvent({ type: "progress", count: 0 }), ...prev].slice(0, 20));
        } catch (startErr) {
          // Job was created but auto-start failed — still navigate so user can start manually.
          setStatusNote(`Created job #${created.id}, but auto-start needs attention. You can press Start on the next page.`);
          return created;
        }
      }
      return created;
    },
    onSuccess: (d) => {
      setErr(null);
      setStatusNote(createAndStart ? `Started! Taking you to your live results…` : `Created! Taking you to your list…`);
      navigate(`/jobs/${d.id}`);
    },
    onError: (e: unknown) => {
      setStatusNote(null);
      setErr(e instanceof Error ? e.message : String(e));
    },
  });

  const handleCreate = () => {
    setErr(null);
    setStatusNote(null);
    if (!url.trim()) { setErr("Please enter a website link to start from"); return; }
    try {
      const fields = parseFields();
      if (fields.length === 0) { setErr("Please list at least one info column (e.g., title: css h1)"); return; }
      createMut.mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">✨ Magic Scraper</h1>
        <p className="text-muted-foreground mt-1">For sales &amp; marketing — just click, no code. Tell us what you want, where, and get a spreadsheet.</p>
        <p className="text-xs text-muted-foreground mt-1">Public demo — no login needed to try. Demo is rate-limited. Sign in for full speed &amp; history.</p>
      </div>

      <PageHelp
        title="How it works for you"
        description="Pick what you want, where to find it, and what info you need. We handle browsers, scrolling, pagination, and deliver a spreadsheet."
        tips={[
          "Single page: One link → one record (e.g., product page → title, price)",
          "List: One link with many items → many records (e.g., category page → all products)",
          "Crawl: Start link → follow links → many pages (e.g., whole site)",
          "For Maps-style searches: paste the search link (e.g., google.com/maps/search/insurance+Kenya) and we’ll scroll and collect",
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>What do you want to collect?</CardTitle>
          <CardDescription>Choose the type — we’ll set smart defaults. You can always fine-tune later.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "single", label: "Single Page", icon: "📄", desc: "One link → One record", example: "Product page" },
              { id: "list", label: "List", icon: "📋", desc: "One link → Many records", example: "Category, search results" },
              { id: "crawl", label: "Crawl Site", icon: "🕷️", desc: "Many pages → Many records", example: "Whole site" },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id as MagicMode)}
                className={`p-4 border rounded-lg text-left hover:border-primary transition-colors ${mode === opt.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}
              >
                <div className="text-2xl mb-1">{opt.icon}</div>
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
                <div className="text-xs text-muted-foreground mt-1 italic">e.g., {opt.example}</div>
                {mode === opt.id && <Badge className="mt-2">Selected</Badge>}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where &amp; what to collect</CardTitle>
          <CardDescription>Works for any site — not just Maps. Paste any link, tell us what columns you need in plain words.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1"><Label>List name (optional)</Label><InfoTooltip content="Friendly name for your team, e.g., 'Kenya Insurance - Dec 2024'" /></div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto: List - example.com - 12/28/2024" />
            <FieldHelp>Leave empty for auto name from link + date.</FieldHelp>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1"><Label>Start link *</Label><InfoTooltip content="Where to start. For Maps: paste the maps search link. For a site: paste category link. For single: paste product link." /></div>
            <Textarea value={url} onChange={(e) => setUrl(e.target.value)} rows={2} placeholder="https://example.com/products&#10;https://www.google.com/maps/search/insurance+Kenya" />
            <FieldHelp>One per line for multiple starts. For Maps/search: paste the full search link, we’ll scroll and collect.</FieldHelp>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Keyword (optional)</Label><InfoTooltip content="What are you looking for? e.g., 'car insurance' – added to list name" /></div>
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="car & bike insurance" />
              <FieldHelp>For generic searches – e.g., “insurance companies” – we’ll include it in the title.</FieldHelp>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Location (optional)</Label><InfoTooltip content="Where? e.g., Kenya, Nairobi. For maps: ensures correct region." /></div>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kenya" />
              <FieldHelp>City or country to focus the search.</FieldHelp>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1"><Label>What columns do you want? *</Label><InfoTooltip content="One per line: column_name: selector. We read each line and grab that info for every result." /></div>
            <Textarea value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} rows={4} placeholder="title: css h1&#10;price: css .price::text&#10;phone: css a[href^='tel:']::text&#10;address: css [data-item-id*='address']" />
            <FieldHelp>
              Format: <code>column_name: selector</code> – e.g., <code>name: css h2</code> or <code>phone: css a[href^='tel:']::text</code>.
              Leave as is for demo (title/price/link) or edit for your site.
            </FieldHelp>
            {fieldsWarning && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded">⚠️ {fieldsWarning}</div>}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Engine</Label><InfoTooltip content="Fastest = plain fetch, Browser = real browser for JS sites, Anti-bot = hidden browser for sites like Google. Try fastest first, then anti-bot if blocked." /></div>
              <Select value={engine} onChange={(e) => setEngine(e.target.value as never)}>
                <option value="static">Fastest</option>
                <option value="dynamic">Browser</option>
                <option value="stealth">Anti-bot</option>
              </Select>
              <FieldHelp>Start with Fastest. If you see “blocked” or empty, try Anti-bot.</FieldHelp>
            </div>
            {(isListMode || isCrawlMode) && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-1"><Label>Max pages</Label><InfoTooltip content="How many pages to visit. 5 for test, 0 = unlimited. For Maps: how many scroll batches." /></div>
                  <Input type="number" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value || "0", 10))} />
                  <FieldHelp>0 = no limit. Start with 5 to test.</FieldHelp>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} id="follow" />
                  <Label htmlFor="follow">Follow links</Label>
                  <InfoTooltip content="Follow links to next pages? On for lists/crawls, off for single page." />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border rounded p-3 bg-muted/20">
            <input type="checkbox" checked={createAndStart} onChange={(e) => setCreateAndStart(e.target.checked)} id="create-start" />
            <Label htmlFor="create-start">Create &amp; start right away (1-click)</Label>
            <InfoTooltip content="When on, we create your list and start collecting immediately, then take you to live results. Turn off to review settings first." />
          </div>
          <FieldHelp>Keep this on for 1-click: create + start + go to results. Turn off if you want to review before starting.</FieldHelp>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={createMut.isPending} size="lg" className="flex-1 md:flex-none">
              {createMut.isPending ? "Creating…" : createAndStart ? `✨ Create & Start ${isSingleMode ? "Single" : isListMode ? "List" : "Crawl"} → Go` : `✨ Create ${isSingleMode ? "Single" : isListMode ? "List" : "Crawl"} → Go`}
            </Button>
            <Button variant="outline" onClick={() => { setFieldsText('title: css h1\nprice: css .price::text\nlink: css a::attr(href)'); setFieldsWarning(null); }}>Reset example</Button>
          </div>
          {statusNote && <div className="text-sm text-muted-foreground bg-muted/40 p-2 rounded">{statusNote}</div>}
          {err && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</div>}
          <p className="text-xs text-muted-foreground">This creates a saved list like in Jobs, but with plain words. Sign-in may be required to save &amp; run.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live progress — plain words, no code</CardTitle>
          <CardDescription>While collecting, you’ll see sentences like below — not raw data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {liveFeed.map((m, i) => (
            <div key={i} className="border rounded p-2 bg-muted/20">{m}</div>
          ))}
          <FieldHelp>After you press Create, we take you to live results where these sentences update in real time.</FieldHelp>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. We create your list{createAndStart ? " and start collecting right away" : ""} and take you to its page.</p>
          <p>2. Watch live: <em>Scrolling results 12/30 … Found 47 companies</em> (plain words, not code).</p>
          <p>3. When done, <strong>Download spreadsheet (CSV)</strong> – columns are your field names (name, phone, address, website). Call or WhatsApp directly from the table.</p>
          <p>4. Need phone/email not on list page? Add a column like <code>email: css a[href^='mailto:']::attr(href)</code> – we’ll visit each detail page automatically if you keep Follow on.</p>
        </CardContent>
      </Card>
    </div>
  );
}
