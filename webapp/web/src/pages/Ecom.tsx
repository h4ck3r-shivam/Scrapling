import * as React from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ArrowRight, Store } from "lucide-react";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import type { Job } from "@/lib/api";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function EcomPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [storeUrl, setStoreUrl] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: () => apiFetch<Job[]>("/jobs"),
  });
  const shopJobs = React.useMemo(
    () => (jobsQ.data ?? []).filter((j) => j.template === "shopify").slice(0, 8),
    [jobsQ.data]
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const url = storeUrl.trim();
      if (!/^https?:\/\/.+\..+/.test(url)) {
        throw new Error("Paste a full store URL starting with https:// — for example https://example.myshopify.com");
      }
      const host = hostOf(url);
      const spec = {
        template: "shopify",
        engine: "static",
        settings: {
          start_urls: [url],
          allowed_domains: host ? [host] : [],
        },
        template_config: {
          target_website: url,
          start_urls: [url],
        },
        export_formats: ["json", "csv"],
      };
      return apiFetch<{ id: number }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: `Shopify — ${host || url.slice(0, 40)}`,
          kind: "crawl",
          engine: "static",
          template: "shopify",
          spec,
        }),
      });
    },
    onSuccess: (d) => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      navigate(`/jobs/${d.id}`);
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Store className="h-7 w-7" /> Shopify scraper
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste any Shopify store URL — we pull every product, variant and price into a spreadsheet. No code.
        </p>
      </div>

      <PageHelp
        title="How it works for you"
        description="Shopify stores expose a standard products feed. Paste the store link, press a button, and you get a table of products instead of clicking through pages."
        tips={[
          "Works on any store ending in .myshopify.com — and most custom-domain Shopify stores too.",
          "You get name, price, variants, images and inventory per product.",
          "Start the job, watch live progress, then download CSV for Excel or Google Sheets.",
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Scrape a store
            <InfoTooltip content="We use the store's own products feed (not screen-scraping), so it's fast and complete — every variant, not just what's visible." />
          </CardTitle>
          <CardDescription>One input, one button. Takes you straight to live results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Store URL</Label>
              <InfoTooltip content="Full link to the store, e.g. https://example.myshopify.com — we read its /products.json feed." />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://example.myshopify.com"
                className="flex-1"
              />
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !storeUrl.trim()}
                size="lg"
                className="rounded-full"
              >
                {createMut.isPending ? "Creating…" : "Scrape store →"}
              </Button>
            </div>
            <FieldHelp>Paste the homepage of the store. We handle collections, pagination and variants automatically.</FieldHelp>
          </div>
          {err && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{err}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Your recent store crawls
          </CardTitle>
          <CardDescription>Every Shopify job you created — press Start, watch live, download CSV.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : shopJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground border rounded p-4 text-center">
              No store crawls yet — paste a URL above and press Scrape store.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {shopJobs.map((j, i) => (
                <motion.div
                  key={j.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                >
                  <Link
                    to={`/jobs/${j.id}`}
                    className="block border rounded-xl p-4 hover:shadow-lg hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{j.name}</span>
                      <Badge variant={j.running ? "default" : "secondary"}>
                        {j.running ? "running" : "idle"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {j.engine} · {j.template} · #{j.id}
                    </div>
                    <div className="text-sm text-primary mt-2 font-medium flex items-center gap-1">
                      Open results <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
