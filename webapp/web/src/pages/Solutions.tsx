import * as React from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import CountUp from "react-countup";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowRight,
  Zap,
  Globe,
  Shield,
  Database,
  Layers,
  ShoppingBag,
  FileText,
  Search,
  Bot,
  BarChart3,
  Truck,
  CheckCircle2,
  Eye,
  Clock3,
  Package,
  Award,
  ArrowUpRight,
  Sparkles,
  Play,
  Timer,
  LockKeyhole,
  MapPinned,
} from "lucide-react";
import { PageHelp } from "@/components/ui/help";
import { helpTexts } from "@/lib/helpTexts";

type Solution = {
  title: string;
  icon: React.ElementType;
  desc: string;
  href: string;
  color: string;
  accent: string;
  stats: string;
  category: string;
  tag: string;
  features: string[];
};

const solutions: Solution[] = [
  {
    title: "Static Fetch",
    icon: Zap,
    desc: "curl_cffi, impersonate Chrome, HTTP/3 – 10k req/min for blogs, APIs, products without JS.",
    href: "/fetch",
    color: "from-orange-500 to-pink-500",
    accent: "bg-orange-500",
    stats: "10k/min",
    category: "Engines",
    tag: "STATIC",
    features: ["HTTP/3 + JA3", "Chrome impersonate", "10k req/min"],
  },
  {
    title: "Dynamic Browser",
    icon: Globe,
    desc: "Playwright – JS, scroll, wait_selector, network_idle – see what a human sees.",
    href: "/fetch",
    color: "from-blue-500 to-cyan-500",
    accent: "bg-blue-500",
    stats: "JS rendered",
    category: "Engines",
    tag: "BROWSER",
    features: ["wait_selector", "Infinite scroll", "network_idle"],
  },
  {
    title: "Stealth",
    icon: Shield,
    desc: "Patchright – hides automation, Cloudflare Turnstile solver, canvas noise.",
    href: "/fetch",
    color: "from-emerald-500 to-teal-500",
    accent: "bg-emerald-500",
    stats: "Cloudflare ✓",
    category: "Engines",
    tag: "STEALTH",
    features: ["Turnstile solver", "Canvas noise", "WebGL patch"],
  },
  {
    title: "Logistics & Delivery",
    icon: Truck,
    desc: "Track every shipment, optimize routes – Chaan-Been for supply chain data.",
    href: "/jobs/new?template=crawl",
    color: "from-violet-500 to-indigo-500",
    accent: "bg-violet-500",
    stats: "Real-time",
    category: "Fleet & Logistics",
    tag: "FLEET",
    features: ["Shipment tracking", "Route signals", "ETA extraction"],
  },
  {
    title: "Ecom – Shopify",
    icon: ShoppingBag,
    desc: "Paste store URL → every product/variant, one call – garmin-style shop.",
    href: "/ecom",
    color: "from-pink-500 to-rose-500",
    accent: "bg-pink-500",
    stats: "Shopify",
    category: "Ecommerce",
    tag: "SHOPIFY",
    features: ["Products + variants", "Prices & images", "Pagination auto"],
  },
  {
    title: "RAG / Markdown",
    icon: FileText,
    desc: "SiteToMarkdown – crawl docs to Markdown corpus for LLMs.",
    href: "/ai",
    color: "from-teal-500 to-cyan-500",
    accent: "bg-teal-500",
    stats: "RAG",
    category: "AI & RAG",
    tag: "AI",
    features: ["Readability", "Main content only", "LLM-ready MD"],
  },
];

const filters = ["All", "Engines", "Fleet & Logistics", "Ecommerce", "AI & RAG"] as const;

const kpis = [
  { value: "24/7", label: "Visibility", sub: "Every movement tracked, day & night", icon: Eye, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40" },
  { value: "95%", label: "Theft reduction", sub: "Immobilize + alerts before loss", icon: Shield, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  { value: "40%", label: "Less downtime", sub: "Predictive diagnostics & fuel insights", icon: Timer, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
  { value: "10k", label: "req / min", sub: "Static engine at scale, polite + fast", icon: Zap, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40" },
];

function AnimatedKpiValue({ value }: { value: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const match = value.match(/^([\d.]+)(.*)$/);
  if (!match) return <span ref={ref}>{value}</span>;
  const num = parseFloat(match[1]);
  const suffix = match[2] ?? "";
  if (Number.isNaN(num)) return <span ref={ref}>{value}</span>;
  const decimals = match[1].includes(".") ? 1 : 0;
  return (
    <span ref={ref}>
      {inView ? (
        <>
          <CountUp end={num} duration={1.8} decimals={decimals} separator="," />
          {suffix}
        </>
      ) : (
        <>0{suffix}</>
      )}
    </span>
  );
}

export default function SolutionsPage() {
  const [active, setActive] = React.useState<(typeof filters)[number]>("All");
  const filtered = active === "All" ? solutions : solutions.filter((s) => s.category === active);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-8">
      <PageHelp title={helpTexts.templates.title} description={helpTexts.templates.description} tips={helpTexts.templates.tips} />

      {/* ---------- HERO — jimiiot "We Know What Moves You" / Garmin VENU style ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-[2rem] border bg-black text-white"
      >
        {/* bg gradient + grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-white/10 to-transparent blur-3xl" />
        <div className="absolute -left-24 -bottom-24 h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-violet-500/10 to-cyan-500/10 blur-3xl" />

        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
          {/* left copy */}
          <div className="p-8 md:p-12 lg:p-14 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-white/60">
              <span className="h-px w-8 bg-white/30" /> Tailored Solutions • Not a device shop
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl lg:text-[48px] font-black tracking-tight leading-[0.95]">
              We Know <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">What Moves</span> You.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/70 max-w-xl">
              Every movement is a risk without visibility. We design <span className="text-white font-semibold">tailored scraping solutions</span> for real
              businesses — from 10k req/min static fetch to stealth browsers that survive Cloudflare.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/jobs/new">
                <Button size="lg" className="rounded-full bg-white text-black hover:bg-white/90 font-semibold px-7 h-11">
                  Talk to Expert <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/magic-demo">
                <Button size="lg" variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white hover:text-black backdrop-blur font-semibold px-7 h-11">
                  <Play className="mr-2 h-4 w-4" /> Try Live Fetch — no login needed
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-white/60">Public demo is rate-limited. Sign in for full speed &amp; history.</p>

            <div className="mt-8 flex flex-wrap items-center gap-6 text-xs">
              <span className="flex items-center gap-2 text-white/70">
                <span className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </span>
                Trusted by ops teams
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <span className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center">
                  <LockKeyhole className="h-3.5 w-3.5" />
                </span>
                Stealth & compliant
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <span className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center">
                  <Clock3 className="h-3.5 w-3.5" />
                </span>
                Setup in 5 min
              </span>
            </div>

            <div className="mt-8 flex items-center gap-3 text-[11px] tracking-wide text-white/50">
              <span className="h-px flex-1 bg-white/10" /> Garmin-inspired • Jimiiot-grade storytelling <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>

          {/* right visual — large product / mock */}
          <div className="relative p-6 md:p-8 lg:p-10 flex items-center">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="relative w-full"
            >
              {/* main card mock — like Garmin watch tile */}
              <div className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 p-6 shadow-2xl">
                <div className="flex items-start justify-between">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-white/50">Chaan-Been</div>
                  <span className="text-[10px] font-bold bg-emerald-500 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
                  </span>
                </div>

                {/* mock preview rows */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { icon: Zap, label: "Static", v: "10k/min", c: "from-orange-500 to-pink-500" },
                    { icon: Globe, label: "Browser", v: "JS ON", c: "from-blue-500 to-cyan-500" },
                    { icon: Shield, label: "Stealth", v: "CF ✓", c: "from-emerald-500 to-teal-500" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center backdrop-blur">
                      <div className={`mx-auto h-9 w-9 rounded-xl bg-gradient-to-br ${m.c} flex items-center justify-center`}>
                        <m.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="mt-2 text-xs font-bold text-white">{m.label}</div>
                      <div className="text-[11px] font-medium text-white/60">{m.v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-white text-zinc-900 p-4 flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-zinc-900 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold leading-none">Shopify Spider</div>
                    <div className="text-xs text-muted-foreground">Paste URL → all variants & prices</div>
                  </div>
                  <Link to="/ecom">
                    <Button size="sm" className="rounded-full bg-black text-white hover:bg-zinc-800">
                      Open
                    </Button>
                  </Link>
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] text-white/50">
                  <span className="flex items-center gap-1.5">
                    <MapPinned className="h-3.5 w-3.5" /> Fleet & OEM supported
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Garmin style hover
                  </span>
                </div>
              </div>

              {/* floating badges — Garmin style */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute -left-2 -bottom-2 md:-left-4 md:bottom-2 hidden sm:flex items-center gap-2 rounded-full bg-white text-zinc-900 shadow-xl border px-3 py-2"
              >
                <span className="h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </span>
                <div className="pr-1">
                  <div className="text-xs font-bold leading-none">98.2% success</div>
                  <div className="text-[11px] text-muted-foreground leading-none">at 5k pages / job</div>
                </div>
              </motion.div>

              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="absolute -right-2 top-4 hidden md:flex items-center gap-2 rounded-full bg-white text-zinc-900 shadow-xl border px-3 py-2"
              >
                <span className="h-6 w-6 rounded-full bg-zinc-900 flex items-center justify-center">
                  <Award className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-xs font-bold pr-1">OEM / ODM ready</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ---------- STICKY FILTER BAR — Garmin mega-menu style ---------- */}
      <div className="sticky top-0 z-20 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 border rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 p-2 overflow-x-auto scrollbar-none">
            <div className="hidden md:flex items-center gap-2 pr-2 mr-2 border-r">
              <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground px-2">Filter</span>
            </div>
            {filters.map((f) => {
              const activeState = active === f;
              return (
                <button
                  key={f}
                  onClick={() => setActive(f)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all border ${
                    activeState
                      ? "bg-primary text-primary-foreground border-primary shadow"
                      : "bg-card hover:bg-accent border-transparent hover:border-border"
                  }`}
                >
                  {f}
                  {f !== "All" && (
                    <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${activeState ? "bg-white/20" : "bg-muted"}`}>
                      {solutions.filter((s) => s.category === f).length}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="ml-auto hidden lg:flex items-center gap-2 pl-2">
              <span className="text-xs text-muted-foreground hidden xl:inline">Showing {filtered.length} solutions</span>
              <Link to="/jobs/new" className="hidden xl:inline-flex">
                <Button size="sm" variant="outline" className="rounded-full">
                  New Job <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- SOLUTION CARDS — Garmin product tile style ---------- */}
      <div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Shop solutions</h2>
            <p className="text-sm text-muted-foreground mt-1">Garmin-style tiles — hover to lift, click to explore. Like browsing watches, but for data.</p>
          </div>
          <Link to="/fetch" className="hidden md:inline-flex text-sm font-semibold hover:underline">
            View fetch docs →
          </Link>
        </div>

        <motion.div layout className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          <AnimatePresence mode="popLayout">
            {filtered.map((s, i) => (
              <motion.div
                key={s.title}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className="group relative overflow-hidden rounded-[1.4rem] border bg-card shadow-sm hover:shadow-2xl hover:shadow-primary/[0.06] hover:border-primary/15 hover:-translate-y-1 transition-all duration-500 will-change-transform flex flex-col"
              >
                {/* image placeholder — Garmin category image with zoom + stats reveal */}
                <div className={`relative h-[168px] bg-gradient-to-br ${s.color} p-[1px] overflow-hidden`}>
                  <div className="h-full w-full bg-gradient-to-br from-card to-muted/40 flex items-center justify-center relative overflow-hidden">
                    {/* subtle grid */}
                    <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, black 1px, transparent 0)", backgroundSize: "18px 18px" }} />
                    {/* icon mock — garmin image zoom on hover */}
                    <div className="relative group-hover:scale-[1.02] transition-transform duration-700 ease-out">
                      <div className="absolute -inset-6 bg-gradient-to-br from-white/0 via-white/0 to-black/5 rounded-full blur-xl group-hover:blur-2xl group-hover:to-black/10 transition-all duration-700" />
                      <div className="relative h-20 w-20 rounded-[1.2rem] bg-background border shadow-lg flex items-center justify-center group-hover:scale-[1.10] group-hover:rotate-[-3deg] group-hover:shadow-xl transition-transform duration-700 ease-out">
                        <s.icon className="h-9 w-9 text-muted-foreground/70 group-hover:text-foreground group-hover:scale-110 transition-all duration-700" />
                      </div>
                      {/* floating count — stats badge with animation */}
                      <div className="absolute -right-6 -top-2 rounded-full bg-card border shadow px-2 py-1 text-[11px] font-bold flex items-center gap-1 group-hover:scale-110 group-hover:-translate-y-1 group-hover:shadow-md transition-all duration-300">
                        <span className={`h-2 w-2 rounded-full ${s.accent} group-hover:animate-pulse`} /> {s.stats}
                      </div>
                    </div>

                    {/* badges — with hover lift */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className="text-[10px] font-black tracking-widest uppercase bg-black text-white px-2.5 py-1 rounded-full shadow group-hover:scale-105 group-hover:shadow-md transition-transform duration-300">{s.tag}</span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="text-[11px] font-semibold bg-white/95 backdrop-blur border px-2.5 py-1 rounded-full shadow flex items-center gap-1 group-hover:scale-105 transition-transform duration-300">
                        <Layers className="h-3 w-3" /> {s.category}
                      </span>
                    </div>

                    {/* hover overlay gradient — garmin lift */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/[0.08] via-black/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    {/* stats reveal strip — relevant hover shows stats */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-8 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 ease-out pointer-events-none">
                      <div className="flex items-center justify-between text-white">
                        <span className="text-xs font-bold flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${s.accent} animate-pulse`} /> {s.stats} • Live</span>
                        <span className="text-[11px] font-medium bg-white/15 backdrop-blur border border-white/20 px-2 py-0.5 rounded-full">{s.features[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* body */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold leading-tight tracking-tight text-[15px] group-hover:text-primary transition-colors duration-300">{s.title}</h3>
                    <span className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:rotate-45 group-hover:scale-110 transition-all duration-300">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2 group-hover:text-foreground/80 transition-colors">{s.desc}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.features.map((feat) => (
                      <span key={feat} className="text-[11px] font-medium bg-muted px-2 py-1 rounded-full border group-hover:bg-primary/5 group-hover:border-primary/10 transition-colors duration-300">
                        {feat}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2 pt-4 border-t">
                    <Link to={s.href} className="flex-1">
                      <Button size="sm" className="w-full rounded-full font-semibold group-hover:shadow-md transition-shadow">
                        Explore <ArrowRight className="ml-1 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </Link>
                    <Link to="/jobs/new?template=crawl">
                      <Button size="sm" variant="outline" className="rounded-full">
                        New Job
                      </Button>
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {filtered.length === 0 && (
          <div className="text-center py-16 border rounded-2xl bg-muted/20 mt-5">
            <p className="text-sm text-muted-foreground">No solutions in this filter.</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => setActive("All")}>
              Show all
            </Button>
          </div>
        )}
      </div>

      {/* ---------- KPI — "What Success Looks Like" Garmin banner style ---------- */}
      <div className="overflow-hidden rounded-[1.6rem] border bg-card">
        <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-0">
          <div className="bg-gradient-to-br from-zinc-900 to-black text-white p-8 md:p-10 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
            <div className="relative">
              <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/60 flex items-center gap-2">
                <Award className="h-4 w-4" /> What Success Looks Like
              </div>
              <h3 className="mt-3 text-3xl font-black tracking-tight leading-none">Measurable. Operational. Trusted.</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Not slides — signals. Chaan-Been is the data layer behind uptime, recovery, and scale. Jimiiot-grade fleet
                storytelling, Garmin-grade polish.
              </p>
              <div className="mt-6 flex gap-3">
                <Link to="/jobs">
                  <Button size="sm" className="rounded-full bg-white text-black hover:bg-white/90">
                    See Success Stories
                  </Button>
                </Link>
                <Link to="/jobs/new">
                  <Button size="sm" variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white hover:text-black">
                    Start a Job
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8 bg-gradient-to-br from-muted/40 to-background">
            <div className="grid grid-cols-2 gap-4">
              {kpis.map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="group rounded-2xl border bg-card p-5 hover:shadow-xl hover:shadow-primary/[0.04] hover:border-primary/10 hover:-translate-y-1 transition-all duration-300 will-change-transform"
                >
                  <div className={`h-9 w-9 rounded-xl ${k.bg} flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                  <div className="mt-3 text-3xl font-black tracking-tight group-hover:text-primary transition-colors duration-300"><AnimatedKpiValue value={k.value} /></div>
                  <div className="text-sm font-bold">{k.label}</div>
                  <div className="text-xs text-muted-foreground leading-snug mt-1">{k.sub}</div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { n: "OEM / ODM", d: "Custom firmware & scrapers", icon: Package },
                { n: "Shopify", d: "1-call store → products", icon: ShoppingBag },
                { n: "RAG Ready", d: "Site → Markdown corpus", icon: FileText },
              ].map((x) => (
                <div key={x.n} className="rounded-2xl bg-muted/60 border px-3 py-3">
                  <x.icon className="h-4 w-4 mx-auto text-muted-foreground" />
                  <div className="text-xs font-bold mt-1">{x.n}</div>
                  <div className="text-[11px] text-muted-foreground">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* bottom trust bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-muted/30 border-t text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> SOC-friendly • Respects robots.txt • Proxy rotation
          </span>
          <span className="flex items-center gap-4 font-medium">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> Exports: JSON / CSV
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Live WebSocket logs
            </span>
          </span>
        </div>
      </div>

      {/* ---------- OEM / Fleet double CTA — Garmin bottom cards ---------- */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div whileHover={{ y: -6, scale: 1.01 }} className="group relative overflow-hidden rounded-[1.4rem] border bg-card hover:shadow-2xl hover:shadow-primary/[0.06] hover:border-primary/10 transition-all duration-500 will-change-transform">
          <div className="h-48 relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500" style={{ backgroundImage: "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.5 }} className="relative h-24 w-24 rounded-2xl bg-white flex items-center justify-center shadow-xl group-hover:shadow-2xl group-hover:scale-110 group-hover:rotate-2 transition-all duration-700 ease-out">
              <Database className="h-10 w-10 text-zinc-900" />
            </motion.div>
            <div className="absolute top-3 left-3 text-[10px] font-black tracking-widest uppercase bg-white text-black px-2.5 py-1 rounded-full shadow group-hover:scale-105 transition-transform duration-300">OEM / ODM</div>
            <div className="absolute bottom-3 right-3 text-[11px] font-semibold bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-full border border-white/10 group-hover:bg-black/70 transition-colors">
              Tailored for your platform
            </div>
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              OEM / ODM <Sparkles className="h-4 w-4 text-amber-500" />
            </CardTitle>
            <CardDescription>Custom devices & firmware — we build tailored scrapers for your platform, not just a generic crawler.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link to="/jobs/new">
              <Button className="rounded-full">Talk to Expert</Button>
            </Link>
            <Link to="/fetch">
              <Button variant="outline" className="rounded-full">
                Test Fetch
              </Button>
            </Link>
          </CardContent>
        </motion.div>

        <motion.div whileHover={{ y: -6, scale: 1.01 }} className="group relative overflow-hidden rounded-[1.4rem] border bg-card hover:shadow-2xl hover:shadow-primary/[0.06] hover:border-primary/10 transition-all duration-500 will-change-transform">
          <div className="h-48 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent group-hover:from-black/30 transition-colors duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <motion.div whileHover={{ scale: 1.08, rotate: 2 }} transition={{ duration: 0.5 }} className="relative h-24 w-24 rounded-2xl bg-white flex items-center justify-center shadow-xl group-hover:shadow-2xl group-hover:scale-110 group-hover:-rotate-2 transition-all duration-700 ease-out">
              <BarChart3 className="h-10 w-10 text-indigo-600 group-hover:scale-110 transition-transform duration-700" />
            </motion.div>
            <div className="absolute top-3 left-3 text-[10px] font-black tracking-widest uppercase bg-white text-indigo-600 px-2.5 py-1 rounded-full flex items-center gap-1 shadow group-hover:scale-105 transition-transform duration-300">
              <Award className="h-3 w-3" /> Success Stories
            </div>
          </div>
          <CardHeader className="pb-2">
            <CardTitle>What Success Looks Like</CardTitle>
            <CardDescription>24/7 visibility, 95% theft reduction, 40% less downtime — measurable outcomes from data you can trust.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link to="/jobs">
              <Button variant="outline" className="rounded-full">
                See Success Stories
              </Button>
            </Link>
            <Link to="/jobs/new?template=crawl">
              <Button variant="ghost" className="rounded-full">
                Start crawl <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </motion.div>
      </div>
    </div>
  );
}
