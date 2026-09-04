import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import CountUp from "react-countup";
import useEmblaCarousel from "embla-carousel-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCards } from "@/components/StatusCards";
import { PageHelp } from "@/components/ui/help";
import { apiFetch } from "@/lib/api";
import {
  PlayCircle, FileText, Activity, Folder, Server, Bot, Globe, ShoppingBag, Watch, Star, Eye, Zap, BadgePercent, Truck, Sparkles, Shield, Package, LayoutDashboard, ChevronDown, Heart, ArrowRight, Database,
} from "lucide-react";
import type { SystemInfoOut, DiskOut, JobOut, JobRunOut } from "@/lib/types";

// Garmin-style mega data — Home Solutions 640px dropdown, 4 cards like garmin SMARTWATCHES
const homeMegaSolutions = [
  { title: "Static Fetch", desc: "curl_cffi • impersonate Chrome", stat: "10k/min", icon: Zap, to: "/fetch", color: "from-orange-500 to-pink-500" },
  { title: "Dynamic Browser", desc: "Playwright • JS rendered", stat: "JS ON", icon: Globe, to: "/fetch", color: "from-blue-500 to-cyan-500" },
  { title: "Stealth", desc: "Patchright • Cloudflare", stat: "CF ✓", icon: Shield, to: "/fetch", color: "from-emerald-500 to-teal-500" },
  { title: "Shopify", desc: "Store → products in 1 click", stat: "1-call", icon: ShoppingBag, to: "/ecom", color: "from-pink-500 to-rose-500" },
];

function bytesPretty(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function AnimatedStat({ end, suffix = "", decimals = 0 }: { end: number; suffix?: string; decimals?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  return (
    <div ref={ref} className="text-2xl font-bold">
      {inView ? <CountUp end={end} duration={1.8} decimals={decimals} separator="," /> : "0"}
      {suffix}
    </div>
  );
}

const heroSlides = [
  {
    eyebrow: "Chaan-Been • Python",
    titleA: "The Web Moves Fast.",
    titleB: "Let’s Make It Smarter.",
    desc: "Chaan-Been turns motion into structured data — effortless scraping for sales, marketing, telecallers. Just click, we handle the rest.",
    primary: { label: "Sign In → Dashboard", to: "/login" },
    secondary: { label: "Explore Solutions", to: "/solutions" },
  },
  {
    eyebrow: "ShopifySpider • One Call",
    titleA: "Any Shopify Store.",
    titleB: "Every Product in 1 Click.",
    desc: "Paste a store URL → products, variants, prices & images, powered by Chaan-Been templates.",
    primary: { label: "Shop Now →", to: "/ecom" },
    secondary: { label: "Try Magic", to: "/magic" },
  },
  {
    eyebrow: "Stealth • Cloudflare Ready",
    titleA: "Blocked? Not Anymore.",
    titleB: "Patchright Stealth Wins.",
    desc: "Turnstile solver, canvas noise, rotating proxies — survive Cloudflare and render JS like a human.",
    primary: { label: "Try Live Fetch →", to: "/fetch" },
    secondary: { label: "See Solutions", to: "/solutions" },
  },
];

const partnerLogos = ["Chaan-Been", "Shopify", "Cloudflare", "Playwright", "Patchright", "curl_cffi", "Python"];

function HomeHeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = React.useState(0);
  const onSelect = React.useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  React.useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
  }, [emblaApi, onSelect]);
  React.useEffect(() => {
    if (!emblaApi) return;
    const id = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => clearInterval(id);
  }, [emblaApi]);
  return (
    <div>
      <div className="overflow-hidden rounded-[2rem]" ref={emblaRef} aria-label="Featured stories carousel" aria-roledescription="carousel">
        <div className="flex">
          {heroSlides.map((s) => (
            <div key={s.titleA} className="flex-[0_0_100%] min-w-0 px-1" role="group" aria-roledescription="slide" aria-label={s.titleA}>
              <div className="text-center max-w-3xl mx-auto py-4">
                <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> {s.eyebrow}
                </div>
                <h1 className="mt-4 text-5xl md:text-6xl font-black tracking-tight leading-[0.9]">
                  {s.titleA}
                  <br />
                  <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">{s.titleB}</span>
                </h1>
                <p className="mt-4 text-lg text-muted-foreground">{s.desc}</p>
                <div className="mt-8 flex justify-center gap-3">
                  <Link to={s.primary.to}><Button size="lg" className="rounded-full">{s.primary.label}</Button></Link>
                  <Link to={s.secondary.to}><Button size="lg" variant="outline" className="rounded-full">{s.secondary.label}</Button></Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="Hero slides">
        {heroSlides.map((s, i) => (
          <button
            key={s.titleA}
            role="tab"
            aria-selected={selected === i}
            aria-label={`Go to slide ${i + 1}: ${s.titleA}`}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-2 rounded-full transition-all duration-300 ${selected === i ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
          />
        ))}
      </div>
    </div>
  );
}

function PartnersMarquee() {
  const row = [...partnerLogos, ...partnerLogos];
  return (
    <div className="mt-10 border-y bg-muted/30 py-4 overflow-hidden marquee-paused" aria-label="Trusted partners">
      <div className="flex w-max gap-8 animate-marquee">
        {row.map((p, i) => (
          <span key={`${p}-${i}`} aria-hidden={i >= partnerLogos.length} className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/40" /> {p}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const hasToken = typeof window !== "undefined" ? !!localStorage.getItem("cb_token") : false;
  const sysQ = useQuery<SystemInfoOut>({
    queryKey: ["system", "info"],
    queryFn: () => apiFetch("/system/info"),
    refetchInterval: 10_000,
    enabled: hasToken,
    retry: false,
  });
  const diskQ = useQuery<DiskOut>({
    queryKey: ["system", "disk"],
    queryFn: () => apiFetch("/system/disk"),
    refetchInterval: 10_000,
    enabled: hasToken,
    retry: false,
  });
  const jobsQ = useQuery<JobOut[]>({
    queryKey: ["jobs"],
    queryFn: () => apiFetch("/jobs"),
    enabled: hasToken,
    retry: false,
  });
  const runsQ = useQuery<JobRunOut[]>({
    queryKey: ["runs", "recent"],
    queryFn: () => apiFetch("/runs?limit=10"),
    refetchInterval: 5_000,
    enabled: hasToken,
    retry: false,
  });
  const mcpQ = useQuery<{ processes: Array<{ name: string; port: number; running: boolean }> }>({
    queryKey: ["system", "mcp"],
    queryFn: () => apiFetch("/system/mcp"),
    refetchInterval: 5_000,
    enabled: hasToken,
    retry: false,
  });

  const runningJobs = jobsQ.data?.filter((j) => j.running).length ?? 0;
  const totalJobs = jobsQ.data?.length ?? 0;
  const totalRuns = runsQ.data?.length ?? 0;
  const totalDisk = diskQ.data
    ? diskQ.data.exports_bytes + diskQ.data.crawls_bytes + diskQ.data.dev_cache_bytes
    : 0;
  const mcpRunning = mcpQ.data?.processes.filter((p) => p.running).length ?? 0;

  // Home header state — Garmin 100% style: Solutions mega 640px with 4 cards
  const [homeSolutionsOpen, setHomeSolutionsOpen] = React.useState(false);
  const homeSolutionsRef = React.useRef<HTMLDivElement>(null);

  // close on Escape / outside click / blur — accessible
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHomeSolutionsOpen(false); };
    const onClick = (e: MouseEvent) => { if (homeSolutionsRef.current && !homeSolutionsRef.current.contains(e.target as Node)) setHomeSolutionsOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  // Public marketing homepage for unauthenticated users (jimiiot + garmin inspired)
  if (!hasToken) {
    return (
      <div className="min-h-screen bg-background">
        {/* Garmin-style Home header — 100% garmin: centered nav, mega on hover, hidden on mobile (md) */}
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold tracking-tight shrink-0">
              <LayoutDashboard className="h-5 w-5" /> Chaan-Been
            </Link>

            {/* Desktop nav — hidden on mobile, group-hover + framer-motion mega */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {/* Solutions — 640px dropdown with 4 cards, icons + stats, footer link — Garmin SMARTWATCHES style */}
              <div
                ref={homeSolutionsRef}
                className="relative group"
                onMouseEnter={() => setHomeSolutionsOpen(true)}
                onMouseLeave={() => setHomeSolutionsOpen(false)}
                onFocus={() => setHomeSolutionsOpen(true)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHomeSolutionsOpen(false); }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={homeSolutionsOpen}
                  aria-controls="home-solutions-mega"
                  onClick={() => setHomeSolutionsOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Solutions <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${homeSolutionsOpen ? "rotate-180" : "group-hover:rotate-180"}`} />
                </button>

                {/* Garmin mega: group-hover visibility + framer-motion fade/slide */}
                <AnimatePresence>
                  {homeSolutionsOpen && (
                    <motion.div
                      id="home-solutions-mega"
                      role="menu"
                      aria-label="Solutions mega menu"
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute left-0 top-full mt-2 w-[640px] max-w-[92vw] bg-popover border rounded-2xl shadow-xl p-4 z-50"
                    >
                      <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2">
                        <Package className="h-3.5 w-3.5" /> Solutions — 4 cards like garmin SMARTWATCHES
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {homeMegaSolutions.map((s, i) => (
                          <motion.div
                            key={s.title}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.2 }}
                          >
                            <Link
                              to={s.to}
                              role="menuitem"
                              className="group/card relative overflow-hidden rounded-xl border bg-card hover:shadow-md transition-all p-4 flex gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring block"
                            >
                              <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${s.color}`} />
                              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover/card:scale-105 transition-transform duration-300">
                                <s.icon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-semibold text-sm leading-tight">{s.title}</div>
                                <div className="text-xs text-muted-foreground">{s.desc}</div>
                                <div className="text-[11px] font-bold mt-1 text-primary">{s.stat}</div>
                              </div>
                            </Link>
                          </motion.div>
                        ))}
                      </div>
                      {/* footer link — accessible, not too large */}
                      <div className="mt-3 pt-3 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Garmin hover — 640px, 4 cards, stats + icons.</span>
                        <Link to="/solutions" role="menuitem" className="text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1">
                          View all solutions →
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* CSS-only fallback for group-hover when JS disabled — invisible but becomes visible on hover */}
                <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-[640px] h-2" aria-hidden />
              </div>

              <Link to="/solutions" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors hidden lg:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Products & Tech
              </Link>
              <Link to="/help" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Resources
              </Link>
            </nav>

            <div className="ml-auto hidden md:flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/login">Sign In</Link></Button>
              <Button asChild size="sm" className="rounded-full"><Link to="/fetch">Try Fetch</Link></Button>
            </div>

            {/* Mobile — hidden mega, simple hamburger-style links (hidden on md) */}
            <div className="ml-auto flex md:hidden items-center gap-2">
              <Link to="/solutions" className="text-sm font-medium px-2 py-1 rounded hover:bg-accent">Solutions</Link>
              <Button asChild size="sm" className="rounded-full"><Link to="/login">Sign In</Link></Button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-16">
          <HomeHeroCarousel />
          <PartnersMarquee />
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              { title: "Static Fetch", desc: "Fast HTTP, impersonate Chrome", icon: "Zap" },
              { title: "Dynamic Browser", desc: "Playwright, JS, scroll", icon: "Globe" },
              { title: "Stealth", desc: "Patchright, Cloudflare", icon: "Shield" },
            ].map(s => (
              <Card key={s.title} className="card-hover">
                <CardHeader><CardTitle className="text-base">{s.title}</CardTitle><CardDescription>{s.desc}</CardDescription></CardHeader>
              </Card>
            ))}
          </div>

          {/* ---------- START FROM A TEMPLATE — one click, real jobs, no fake products ---------- */}
          <div className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.16em] uppercase bg-black text-white px-3 py-1 rounded-full">
                  <Sparkles className="h-3 w-3" /> Templates • One Click
                </div>
                <h2 className="mt-3 text-2xl md:text-3xl font-black tracking-tight leading-none">Start from a template</h2>
                <p className="text-sm text-muted-foreground mt-1">Pick what you want to collect — we pre-fill the job for you. No fake data, every card creates a real crawl.</p>
              </div>
              <Link to="/jobs/new" className="hidden md:inline-flex text-sm font-semibold hover:underline items-center gap-1">Custom job <ArrowRight className="h-4 w-4" /></Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
              {[
                { title: "Shopify store", desc: "Paste a store URL → every product, variant, price", to: "/jobs/new?template=shopify", icon: ShoppingBag },
                { title: "Sitemap crawl", desc: "Feed sitemap URLs → crawl only those pages", to: "/jobs/new?template=sitemap", icon: FileText },
                { title: "XML / CSV feed", desc: "RSS, product feeds, rows as data", to: "/jobs/new?template=xml_feed", icon: Database },
                { title: "Site to Markdown", desc: "Whole site → clean Markdown for AI / RAG", to: "/ai", icon: Bot },
              ].map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  whileHover={{ y: -8, scale: 1.01 }}
                  className="group relative rounded-[1.4rem] border bg-card overflow-hidden hover:shadow-2xl hover:shadow-primary/[0.06] hover:border-primary/15 transition-all duration-500 will-change-transform flex flex-col"
                >
                  <div className="relative h-[120px] bg-gradient-to-br from-muted to-muted/20 flex items-center justify-center overflow-hidden p-4">
                    <p.icon className="h-10 w-10 text-muted-foreground/50 group-hover:scale-110 group-hover:text-foreground transition-all duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/[0.08] via-black/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="font-black tracking-tight leading-none group-hover:text-primary transition-colors duration-300">{p.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex-1">{p.desc}</div>
                    <div className="mt-3">
                      <Link to={p.to}>
                        <Button size="sm" className="w-full rounded-full font-semibold group-hover:shadow-md transition-shadow">
                          Use this <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center">
            <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Built on Trust. Powered by Scale.</div>
            <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
              <div><AnimatedStat end={20} suffix="+" /><div className="text-xs text-muted-foreground">Years</div></div>
              <div><AnimatedStat end={50} suffix="+" /><div className="text-xs text-muted-foreground">Templates</div></div>
              <div><AnimatedStat end={8} suffix="M" /><div className="text-xs text-muted-foreground">Pages/mo</div></div>
              <div><AnimatedStat end={95} suffix="%" /><div className="text-xs text-muted-foreground">Success</div></div>
              <div><AnimatedStat end={24} suffix="/7" /><div className="text-xs text-muted-foreground">Uptime</div></div>
              <div><AnimatedStat end={40} suffix="%" /><div className="text-xs text-muted-foreground">Less downtime</div></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chaan-Been — fetch pages, crawl sites, export data. Quick stats below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/fetch"><PlayCircle className="h-4 w-4 mr-1" /> New fetch</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/jobs/new">New crawl job</Link>
          </Button>
        </div>
      </div>

      <PageHelp
        title="Your dashboard"
        description="This page gives you a quick look at your jobs, recent activity, and storage. Click anything to drill in."
        tips={[
          "Use “New fetch” to grab one page quickly (no saving, no history).",
          "Use “New crawl job” to set up a saved recipe you can run again.",
          "If a card turns red, something needs attention — open it.",
        ]}
      />

      <StatusCards
        items={[
          {
            label: "Active jobs",
            value: runningJobs,
            detail: `of ${totalJobs} total`,
            variant: runningJobs > 0 ? "ok" : "neutral",
          },
          {
            label: "Recent runs",
            value: totalRuns,
            detail: "Most recent first",
            variant: "neutral",
          },
          {
            label: "Disk usage",
            value: bytesPretty(totalDisk),
            detail: diskQ.data ? "Exports + crawls + dev cache" : "Loading…",
            variant: totalDisk > 5 * 1024 ** 3 ? "warn" : "ok",
          },
          {
            label: "MCP server",
            value: mcpRunning > 0 ? "Running" : "Stopped",
            detail: mcpRunning > 0 ? "AI can connect" : "Launch from System",
            variant: mcpRunning > 0 ? "ok" : "neutral",
          },
        ]}
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Recent runs</CardTitle>
            <CardDescription>The 10 most recent crawl attempts across all jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            {runsQ.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : runsQ.data && runsQ.data.length > 0 ? (
              <div className="divide-y">
                <AnimatePresence>
                  {runsQ.data.slice(0, 8).map((r, idx) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ delay: idx * 0.04, duration: 0.25 }}
                    >
                      <Link
                        to={`/jobs/${r.job_id}`}
                        className="flex items-center justify-between py-2 hover:bg-muted/40 px-2 -mx-2 rounded transition-colors"
                      >
                        <div>
                          <div className="font-medium">{r.job_name ?? `Job #${r.job_id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            Run #{r.id} · {r.started_at ?? "—"} · {r.items_count} items
                          </div>
                        </div>
                        <Badge variant={
                          r.status === "running" ? "default" :
                          r.status === "completed" ? "secondary" :
                          r.status === "failed" ? "destructive" :
                          "outline"
                        }>{r.status}</Badge>
                      </Link>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No runs yet — start a fetch or a crawl job to see activity here.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        {[
          { title: "Parse playground", icon: FileText, desc: "Test CSS / XPath / regex selectors against HTML, save your favourites.", to: "/parse", label: "Open parse →" },
          { title: "Jobs", icon: Folder, desc: "Saved crawler recipes — start, pause, resume, export.", to: "/jobs", label: "Browse jobs →" },
          { title: "System", icon: Server, desc: "Version, browser deps, disk usage, MCP control.", to: "/system", label: "Open system →" },
        ].map((c) => (
          <motion.div key={c.title} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} whileHover={{ y: -3, transition: { type: "spring", stiffness: 400 } }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><c.icon className="h-4 w-4" /> {c.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {c.desc}
              </CardContent>
              <Button asChild variant="ghost" className="ml-4 mb-2">
                <Link to={c.to}>{c.label}</Link>
              </Button>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
