import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { helpTexts } from "@/lib/helpTexts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";

const MAP_FIELDS = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address" },
  { id: "website", label: "Website" },
  { id: "emails", label: "Emails" },
  { id: "rating", label: "Rating" },
  { id: "reviews", label: "Reviews" },
  { id: "hours", label: "Hours" },
  { id: "clients", label: "Clients" },
  { id: "main_business", label: "Main business" },
] as const;

export type MapsFieldId = (typeof MAP_FIELDS)[number]["id"];

/** Convert a raw WS / progress event into a human sentence for telecallers. No JSON. */
export function humanizeMapsEvent(d: Record<string, unknown>): string {
  const t = String(d.type ?? d.status ?? d.event ?? "");
  const count =
    (d.found as number | undefined) ??
    (d.items_count as number | undefined) ??
    (d.count as number | undefined) ??
    (d.total as number | undefined);
  const name =
    (d.name as string | undefined) ??
    ((d.item as Record<string, unknown> | undefined)?.name as string | undefined) ??
    "";

  if (t === "item" || d.item) {
    if (name) return `Found 1 company — ${name}. Saved to your list.`;
    return `Found 1 company. Saved to your list.`;
  }
  if (t.includes("scroll") || t.includes("map")) {
    if (typeof count === "number" && count > 0) return `Scrolling Maps… found ${count} so far. Keep this tab open.`;
    return `Scrolling Maps to find more companies… keep this tab open.`;
  }
  if (t.includes("enrich")) {
    if (name) return `Checking website for ${name} to find emails and phones…`;
    return `Checking company websites for extra emails and phones…`;
  }
  if (t.includes("progress") || t.includes("status")) {
    if (typeof count === "number" && count > 0) return `Found ${count} companies so far. Still collecting…`;
    return `Working… scrolling Maps and collecting companies for you.`;
  }
  if (t === "done" || t.includes("complete") || t.includes("finish")) {
    if (typeof count === "number") return `Done! Found ${count} companies. Download your spreadsheet below.`;
    return `Done! Your list is ready. Download your spreadsheet.`;
  }
  if (t.includes("error") || t.includes("fail") || d.error) {
    return `Hmm, hit a snag on Maps. Try again or switch the engine option.`;
  }
  if (typeof count === "number" && count > 0) return `Found ${count} companies so far.`;
  return `Working… collecting your list from Maps.`;
}

export default function MapsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("car and bike insurance companies in Kenya");
  const [location, setLocation] = React.useState("");
  const [maxResults, setMaxResults] = React.useState(50);
  const [maxScrolls, setMaxScrolls] = React.useState(20);
  const [fields, setFields] = React.useState<Record<MapsFieldId, boolean>>({
    name: true,
    phone: true,
    address: true,
    website: true,
    emails: true,
    rating: true,
    reviews: true,
    hours: true,
    clients: true,
    main_business: true,
  });
  const [engine, setEngine] = React.useState<"stealth" | "dynamic">("stealth");
  const [enrichWebsites, setEnrichWebsites] = React.useState(true);
  const [name, setName] = React.useState("");
  const [createAndStart, setCreateAndStart] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [statusNote, setStatusNote] = React.useState<string | null>(null);
  const [liveFeed, setLiveFeed] = React.useState<string[]>([
    "Example: Scrolling Maps to find more companies… keep this tab open.",
    "Example: Found 12 companies so far. Still collecting…",
  ]);

  function toggleField(id: MapsFieldId) {
    setFields((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selectedFields = MAP_FIELDS.filter((f) => fields[f.id]).map((f) => f.id);

  const createMut = useMutation({
    mutationFn: async () => {
      const jobName =
        name.trim() || `${query.trim().slice(0, 60) || "Maps"}${location.trim() ? ` in ${location.trim()}` : ""} - ${new Date().toLocaleDateString()}`;
      setStatusNote("Creating your Maps list…");
      const created = await apiFetch<{ id: number }>("/magic/maps", {
        method: "POST",
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim() || undefined,
          max_results: maxResults,
          max_scrolls: maxScrolls,
          fields: selectedFields,
          engine,
          enrich_websites: enrichWebsites,
          name: jobName,
        }),
      });
      if (createAndStart) {
        setStatusNote(`Starting your Maps search (job #${created.id})…`);
        setLiveFeed((prev) => [`Starting… opening Maps for “${query.trim()}”.`, ...prev].slice(0, 20));
        try {
          await apiFetch(`/jobs/${created.id}/start`, { method: "POST" });
          setLiveFeed((prev) => [humanizeMapsEvent({ type: "progress", count: 0 }), ...prev].slice(0, 20));
        } catch {
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
    if (!query.trim()) {
      setErr("Please tell us what to look for — for example: car and bike insurance companies in Kenya");
      return;
    }
    if (selectedFields.length === 0) {
      setErr("Please tick at least one info box below (for example: Name and Phone).");
      return;
    }
    createMut.mutate();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Find Companies on Maps</h1>
        <p className="text-muted-foreground mt-1">For sales, marketing and telecallers — just type what you want in plain words. No technical stuff.</p>
      </div>

      <PageHelp
        title={helpTexts.maps.title}
        description={helpTexts.maps.description}
        tips={[...helpTexts.maps.tips]}
      />

      <Card>
        <CardHeader>
          <CardTitle>What are you looking for?</CardTitle>
          <CardDescription>Type a normal sentence — like you would tell a friend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>What?</Label>
              <InfoTooltip content={helpTexts.maps.fields.query} />
            </div>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={2}
              placeholder="car and bike insurance companies in Kenya"
            />
            <FieldHelp>{helpTexts.maps.fields.query}</FieldHelp>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Where? (optional)</Label>
              <InfoTooltip content={helpTexts.maps.fields.location} />
            </div>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Nairobi, Kenya — leave empty to use the place in your sentence above"
            />
            <FieldHelp>{helpTexts.maps.fields.location}</FieldHelp>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>List name (optional)</Label>
              <InfoTooltip content={helpTexts.maps.fields.name} />
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto: your sentence + today's date"
            />
            <FieldHelp>{helpTexts.maps.fields.name}</FieldHelp>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How many &amp; what info?</CardTitle>
          <CardDescription>Pick how big a list you want, and which details to save for each company.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>How many companies? ({maxResults})</Label>
              <InfoTooltip content={helpTexts.maps.fields.maxResults} />
            </div>
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={maxResults}
              onChange={(e) => setMaxResults(parseInt(e.target.value || "50", 10))}
              className="w-full accent-primary"
              aria-label="How many companies to collect"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>20 (quick test)</span>
              <span>500 (big list)</span>
            </div>
            <FieldHelp>{helpTexts.maps.fields.maxResults}</FieldHelp>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>How far to scroll Maps? ({maxScrolls} scrolls)</Label>
              <InfoTooltip content="How many times we scroll down the Maps results list. More scrolls = more companies for big lists. 20 is enough for ~100 companies, use 50 for 500." />
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={maxScrolls}
              onChange={(e) => setMaxScrolls(parseInt(e.target.value || "20", 10))}
              className="w-full accent-primary"
              aria-label="How many times to scroll Maps"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 (quick)</span>
              <span>100 (whole list)</span>
            </div>
            <FieldHelp>We stop early if Maps says “You’ve reached the end”, so higher is safe — it just allows bigger lists.</FieldHelp>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>What info should we save for each company?</Label>
              <InfoTooltip content={helpTexts.maps.fields.fields} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MAP_FIELDS.map((f) => (
                <label
                  key={f.id}
                  className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${fields[f.id] ? "border-primary bg-primary/5" : "bg-card"}`}
                >
                  <input type="checkbox" checked={fields[f.id]} onChange={() => toggleField(f.id)} />
                  {f.label}
                </label>
              ))}
            </div>
            <FieldHelp>{helpTexts.maps.fields.fields}</FieldHelp>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How should we collect?</CardTitle>
          <CardDescription>Smart defaults — you normally don&apos;t need to change these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Engine</Label>
              <InfoTooltip content={helpTexts.maps.fields.engine} />
            </div>
            <Select value={engine} onChange={(e) => setEngine(e.target.value as "stealth" | "dynamic")}>
              <option value="stealth">Recommended — careful mode (works best on Maps)</option>
              <option value="dynamic">Backup — normal browser mode</option>
            </Select>
            <FieldHelp>{helpTexts.maps.fields.engine}</FieldHelp>
          </div>

          <div className="flex items-center gap-2 border rounded p-3 bg-muted/20">
            <input
              type="checkbox"
              checked={enrichWebsites}
              onChange={(e) => setEnrichWebsites(e.target.checked)}
              id="enrich-websites"
            />
            <Label htmlFor="enrich-websites">Visit each company website for extra emails &amp; phones</Label>
            <InfoTooltip content={helpTexts.maps.fields.enrich} />
          </div>
          <FieldHelp>{helpTexts.maps.fields.enrich}</FieldHelp>

          <div className="flex items-center gap-2 border rounded p-3 bg-muted/20">
            <input
              type="checkbox"
              checked={createAndStart}
              onChange={(e) => setCreateAndStart(e.target.checked)}
              id="create-start"
            />
            <Label htmlFor="create-start">Create &amp; start right away (1-click)</Label>
            <InfoTooltip content={helpTexts.maps.fields.createAndStart} />
          </div>
          <FieldHelp>{helpTexts.maps.fields.createAndStart}</FieldHelp>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleCreate} disabled={createMut.isPending} size="lg" className="flex-1 md:flex-none">
              {createMut.isPending ? "Finding companies…" : "Find Companies → Go"}
            </Button>
          </div>
          {statusNote && <div className="text-sm text-muted-foreground bg-muted/40 p-2 rounded">{statusNote}</div>}
          {err && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</div>}
          <p className="text-xs text-muted-foreground">
            This saves a list like in Jobs and takes you to its live page. See everything under{" "}
            <Link to="/runs" className="underline font-medium">Runs</Link>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live progress — plain words, no code</CardTitle>
          <CardDescription>While collecting, you will see sentences like these — not raw data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {liveFeed.map((m, i) => (
            <div key={i} className="border rounded p-2 bg-muted/20">{m}</div>
          ))}
          <FieldHelp>After you press Find Companies, we take you to live results where these sentences update in real time.</FieldHelp>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. We open Maps for your sentence (for example &ldquo;2 wheeler insurance Kenya&rdquo;) and scroll down to collect companies.</p>
          <p>2. Watch live: <em>Scrolling Maps… found 25 so far</em> — plain sentences, updated as we go.</p>
          <p>3. When done, <strong>download your spreadsheet</strong> — one row per company with name, phone, address and website. Call or WhatsApp directly from the table.</p>
          <p>
            4. You can follow every run under <Link to="/runs" className="underline font-medium">Runs</Link> — pause, resume or download anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
