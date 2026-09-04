import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle, FolderPlus, FileText, Server, Bot, Sparkles, Globe } from "lucide-react";

interface Step {
  title: string;
  body: React.ReactNode;
  ascii?: string;
}

interface Section {
  id: string;
  title: string;
  intro: string;
  steps: Step[];
  next?: { to: string; label: string };
}

const SECTIONS: Section[] = [
  {
    id: "what",
    title: "What is scraping?",
    intro: "Web scraping means asking a website for its content and saving what you want. Imagine copy-pasting from a website, but for hundreds or thousands of pages.",
    steps: [
      {
        title: "A page is a document",
        body: "Every website serves your browser a document written in HTML. The browser paints it as buttons and pictures; we read it as text and structure.",
        ascii: `<!doctype html>
<html>
  <body>
    <h1>Product name</h1>
    <span class="price">$19.99</span>
  </body>
</html>`,
      },
      {
        title: "Pick the parts you want",
        body: "A scraper is a recipe: which URLs to visit, what to grab from each page (title, price, image…), and where to save the result.",
        ascii: `Page → grab "h1"          → "Product name"
       grab ".price"        → "$19.99"
       grab "img.product"    → "https://…/pic.jpg"`,
      },
      {
        title: "Save it as a file",
        body: "Results come out as JSON, CSV, or XML — files you can open in Excel or feed to another program.",
      },
    ],
    next: { to: "/fetch", label: "Try a single fetch" },
  },
  {
    id: "fetch",
    title: "How to make a fetch",
    intro: "Fetch = grab one page, look at the result. Perfect for testing selectors before turning them into a crawl.",
    steps: [
      {
        title: "Open the Fetch page",
        body: "Click New fetch on the dashboard, or navigate to /fetch.",
      },
      {
        title: "Type the URL",
        body: "Paste any web address. The page will load once you click Fetch.",
      },
      {
        title: "Pick an engine",
        body: (
          <>
            <p>Three options:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><b>Static</b> — fastest, just HTTP. Use it for plain pages (JSON APIs, server-rendered HTML).</li>
              <li><b>Dynamic</b> — opens a real browser. Use it for pages that need JavaScript to render.</li>
              <li><b>Stealth</b> — like Dynamic, but hides the automation. Use it for sites that block bots.</li>
            </ul>
          </>
        ),
      },
      {
        title: "Read the response",
        body: "Below the form you'll see the status code (200 = OK), headers, cookies, HTML body, and (for browser engines) a markdown preview.",
        ascii: `Response — 200 OK · 47.3 KB · 312 ms
[Headers] [Cookies] [HTML] [Markdown]
─────────────────────────────────────────
<!doctype html>
<html>…</html>`,
      },
    ],
    next: { to: "/parse", label: "Test selectors in Parse" },
  },
  {
    id: "crawl",
    title: "How to make a crawl",
    intro: "Crawl = run the same fetch across many pages, save everything. Use Jobs for that.",
    steps: [
      {
        title: "Open Jobs → New job",
        body: "Click New crawl job on the dashboard.",
      },
      {
        title: "Pick a template",
        body: (
          <>
            <p>Templates pre-fill the right settings:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><b>Custom</b> — start from scratch</li>
              <li><b>Crawl</b> — visit a site, follow links</li>
              <li><b>Sitemap</b> — read <code>sitemap.xml</code>, visit each URL</li>
              <li><b>Shopify</b> — pull every product from a Shopify store</li>
              <li><b>XML Feed</b> — parse an RSS / Atom feed</li>
              <li><b>CSV Feed</b> — parse a CSV download</li>
              <li><b>Site → Markdown</b> — convert every page to a .md file (great for RAG)</li>
            </ul>
          </>
        ),
      },
      {
        title: "Fill the tabs",
        body: (
            <ol className="list-decimal pl-5 space-y-1">
              <li><b>Basic</b> — name, start URL, fields to extract.</li>
              <li><b>Advanced</b> — concurrency, delays, retries.</li>
              <li><b>Template</b> — template-specific options.</li>
              <li><b>Export & JSON</b> — output formats, advanced spec editor.</li>
            </ol>
        ),
      },
      {
        title: "Save and Start",
        body: "Hit Save, then on the job detail click Start. Watch progress live under the Live tab.",
      },
    ],
    next: { to: "/jobs/new", label: "Open New Job" },
  },
  {
    id: "results",
    title: "How to interpret results",
    intro: "Once a job has run, you have items. Here's how to make sense of them.",
    steps: [
      {
        title: "Open a run",
        body: "Jobs → click a job → click any run in the Runs list. You'll see four tabs.",
      },
      {
        title: "Results tab",
        body: "A table of every item extracted. Each row is one page; columns are the fields you defined.",
        ascii: `idx   title             price    url
─────────────────────────────────────
12    "Red sneakers"     49.99    /p/12
13    "Blue sneakers"     49.99    /p/13`,
      },
      {
        title: "Live tab",
        body: "Real-time events from a running job — items as they arrive, log lines, status changes.",
      },
      {
        title: "Exports tab",
        body: "Generate downloadable files: JSON, JSONL, CSV, XML. Each link gives you a copy to keep.",
      },
      {
        title: "Logs tab",
        body: "Everything the spider logged: requests, retries, errors. Useful when something goes wrong.",
      },
    ],
    next: { to: "/jobs", label: "Browse jobs" },
  },
  {
    id: "export",
    title: "How to export",
    intro: "Get your data out of Chaan-Been and into a tool you already use.",
    steps: [
      {
        title: "From a run's Exports tab",
        body: "Choose the format you want (CSV for Excel, JSON for code, XML for legacy) and click Generate. A Download button appears.",
      },
      {
        title: "Format tips",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><b>CSV</b> — opens in Excel/Sheets; column headers match your field names.</li>
            <li><b>JSON</b> — perfect for feeding back into code or a database.</li>
            <li><b>Markdown ZIP</b> — for Site-to-Markdown runs; one file per page.</li>
          </ul>
        ),
      },
      {
        title: "Use the API",
        body: "Every export is also available at /api/exports/download/{run_id}/{format}. Authenticate with the JWT in localStorage or an API key from /api-keys.",
      },
    ],
    next: { to: "/system", label: "Open System" },
  },
  {
    id: "ai",
    title: "AI integrations",
    intro: "Connect an AI assistant (Claude, Cursor, your custom agent) to Chaan-Been.",
    steps: [
      {
        title: "Start the MCP server",
        body: "Go to System → MCP. Click Start. The page will show a URL and an auth token.",
      },
      {
        title: "Configure your AI client",
        body: "Paste the URL and token into your AI assistant's MCP config. The exact format depends on your client — the page shows the command and env vars to use.",
      },
      {
        title: "Available tools",
        body: "Once connected, the AI can call scrapling tools to fetch pages, run selectors, save results, and start jobs.",
      },
    ],
    next: { to: "/ai", label: "Open AI page" },
  },
];

export default function HelpPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5" /> Quick start guide</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you need to know to go from a blank dashboard to your first export, in six short sections.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Five minutes from zero to data</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li><Link className="underline" to="/fetch">Fetch</Link> a single page to make sure Chaan-Been can reach it.</li>
            <li>Open <Link className="underline" to="/parse">Parse</Link>, paste that page's HTML, build selectors that grab what you want.</li>
            <li><Link className="underline" to="/jobs/new">Create a Job</Link> from those selectors, choose a template (Custom or Crawl usually).</li>
            <li>Click Start on the job. Watch items appear in the Live tab.</li>
            <li>When done, go to Exports, generate a CSV, download it.</li>
          </ol>
        </CardContent>
      </Card>

      {SECTIONS.map((s) => (
        <Card key={s.id} id={s.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{s.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{s.intro}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.steps.map((step, i) => (
              <div key={i}>
                <h3 className="font-medium">{i + 1}. {step.title}</h3>
                <div className="text-sm text-muted-foreground mt-1">{step.body}</div>
                {step.ascii ? (
                  <pre className="mt-2 text-xs bg-muted/40 border rounded-md p-3 overflow-x-auto font-mono whitespace-pre">
                    {step.ascii}
                  </pre>
                ) : null}
              </div>
            ))}
            {s.next ? (
              <Button asChild className="mt-2">
                <Link to={s.next.to}>{s.next.label} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Where to next?</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Button asChild variant="outline"><Link to="/fetch"><PlayCircle className="mr-1 h-4 w-4" />New fetch</Link></Button>
          <Button asChild variant="outline"><Link to="/jobs/new"><FolderPlus className="mr-1 h-4 w-4" />New crawl job</Link></Button>
          <Button asChild variant="outline"><Link to="/parse"><FileText className="mr-1 h-4 w-4" />Parse playground</Link></Button>
          <Button asChild variant="outline"><Link to="/system"><Server className="mr-1 h-4 w-4" />System & MCP</Link></Button>
          <Button asChild variant="outline"><Link to="/ai"><Bot className="mr-1 h-4 w-4" />AI page</Link></Button>
          <Button asChild variant="outline"><Link to="/"><Globe className="mr-1 h-4 w-4" />Dashboard</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}