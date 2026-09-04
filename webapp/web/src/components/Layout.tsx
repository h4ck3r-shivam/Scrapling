import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Search, Code2, Database, Users, Settings, LogOut, Server, Library, Bot, Layers, Key, ClipboardList, Activity, Sparkles, Package, Store, HelpCircle, ChevronDown, Zap, Globe, Shield, ShoppingBag, FileText, BarChart3, Truck, BookOpen, Award, MessageSquare, Menu, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const nav: { to: string; label: string; icon: React.ElementType; admin?: boolean }[] = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/magic", label: "Magic", icon: Sparkles },
  { to: "/maps", label: "Maps", icon: MapPin },
  { to: "/solutions", label: "Solutions", icon: Package },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/runs", label: "Runs", icon: Activity },
  { to: "/fetch", label: "Fetch", icon: Search },
  { to: "/parse", label: "Parse", icon: Code2 },
  { to: "/sessions", label: "Sessions", icon: Layers },
  { to: "/proxies", label: "Proxies", icon: Server },
  { to: "/selectors", label: "Selectors", icon: Library },
  { to: "/ai", label: "AI / MCP", icon: Bot },
  { to: "/users", label: "Users", icon: Users, admin: true },
  { to: "/api-keys", label: "API Keys", icon: Key, admin: true },
  { to: "/audit", label: "Audit", icon: ClipboardList, admin: true },
  { to: "/system", label: "System", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
];

// Garmin-style mega menu data — hover to reveal, like SMARTWATCHES mega menu
const megaSolutions = [
  { title: "Static Fetch", desc: "curl_cffi • 10k/min", icon: Zap, to: "/fetch", color: "from-orange-500 to-pink-500" },
  { title: "Dynamic Browser", desc: "Playwright • JS rendered", icon: Globe, to: "/fetch", color: "from-blue-500 to-cyan-500" },
  { title: "Stealth", desc: "Patchright • Cloudflare ✓", icon: Shield, to: "/fetch", color: "from-green-500 to-emerald-500" },
  { title: "Shopify Spider", desc: "Store → products in 1 click", icon: ShoppingBag, to: "/ecom", color: "from-pink-500 to-rose-500" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const navgt = useNavigate();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === "admin";
  // Garmin 100%: Solutions + Products & Tech mega menus — group-hover + framer-motion fade/slide, accessible, not too large, hidden on mobile (md)
  const [solutionsOpen, setSolutionsOpen] = React.useState(false);
  const [productsOpen, setProductsOpen] = React.useState(false);
  const [resourcesOpen, setResourcesOpen] = React.useState(false);
  // Close on Escape for accessibility
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSolutionsOpen(false); setProductsOpen(false); setResourcesOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="min-h-screen bg-background flex">
      <motion.aside initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="w-[240px] border-r bg-muted/20 hidden md:flex flex-col">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="h-14 flex items-center px-4 border-b font-semibold gap-2 cursor-default">
          <motion.div whileHover={{ rotate: 12, scale: 1.1 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}><LayoutDashboard className="h-5 w-5" /></motion.div> <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>Chaan-Been</motion.span>
        </motion.div>
        <nav className="flex-1 p-2 space-y-1 overflow-auto">
          {nav.map((n, i) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <motion.div key={n.to} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025, duration: 0.3 }} whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
                <Link to={n.to} className={cn("relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors duration-200", active && "bg-accent text-accent-foreground shadow-sm", n.admin && !isAdmin && "opacity-70")}>
                  {active && <motion.div layoutId="activeNavIndicator" className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-full" transition={{ type: "spring", stiffness: 500, damping: 30 }} />}
                  <motion.span whileHover={{ scale: active ? 1 : 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                    <Icon className="h-4 w-4" />
                  </motion.span> {n.label}
                  {n.admin && <Badge variant={isAdmin ? "secondary" : "outline"} className="ml-auto text-[10px] px-1.5 py-0">admin</Badge>}
                </Link>
              </motion.div>
            );
          })}
        </nav>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="p-3 border-t space-y-2">
          {user ? (
            <>
              <div className="text-xs text-muted-foreground truncate">{user?.email} · {user?.role}</div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { logout(); navgt("/login"); }}>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </motion.div>
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">Browsing public demo — no login needed.</div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button size="sm" className="w-full" onClick={() => navgt("/login")}>
                  Sign in
                </Button>
              </motion.div>
              <div className="text-[11px] text-muted-foreground">Demo is rate-limited. Sign in for full speed.</div>
            </>
          )}
        </motion.div>
      </motion.aside>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Garmin 100% mega menu header — desktop only (hidden on mobile md), group-hover + framer-motion fade/slide, accessible, not too large */}
        <div className="hidden md:flex h-14 border-b items-center px-4 xl:px-6 gap-6 sticky top-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-30">
          <Link to="/" className="flex items-center gap-2 font-semibold shrink-0">
            <LayoutDashboard className="h-5 w-5" /> Chaan-Been
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {/* Solutions mega — 640px dropdown with 4 cards, icons + stats, footer link — Garmin SMARTWATCHES style */}
            <div
              className="relative group"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
              onFocus={() => setSolutionsOpen(true)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSolutionsOpen(false); }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={solutionsOpen}
                aria-controls="layout-solutions-mega"
                onClick={() => setSolutionsOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Solutions <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${solutionsOpen ? "rotate-180" : "group-hover:rotate-180"}`} />
              </button>
              <AnimatePresence>
                {solutionsOpen && (
                  <motion.div
                    id="layout-solutions-mega"
                    role="menu"
                    aria-label="Solutions mega menu"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute left-0 top-full mt-2 w-[640px] max-w-[92vw] bg-popover border rounded-2xl shadow-xl p-4 z-50"
                  >
                    <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2"><Package className="h-3.5 w-3.5" /> Solutions — 4 cards like garmin SMARTWATCHES</div>
                    <div className="grid grid-cols-2 gap-3">
                      {megaSolutions.map((s, i) => (
                        <motion.div key={s.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.18 }}>
                          <Link to={s.to} role="menuitem" className="group/card relative overflow-hidden rounded-xl border bg-card hover:shadow-md transition-all p-4 flex gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring block">
                            <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${s.color}`} />
                            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover/card:scale-105 transition-transform duration-300"><s.icon className="h-4 w-4" /></div>
                            <div>
                              <div className="font-semibold text-sm leading-tight">{s.title}</div>
                              <div className="text-xs text-muted-foreground">{s.desc}</div>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm" variant="outline" className="rounded-full flex-1"><Link to="/solutions">View all solutions →</Link></Button>
                      <Button asChild size="sm" className="rounded-full flex-1"><Link to="/jobs/new">Start crawl</Link></Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Products & Tech mega — 3 columns like garmin Product categories — also Garmin 100% */}
            <div
              className="relative group"
              onMouseEnter={() => setProductsOpen(true)}
              onMouseLeave={() => setProductsOpen(false)}
              onFocus={() => setProductsOpen(true)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setProductsOpen(false); }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={productsOpen}
                aria-controls="layout-products-mega"
                onClick={() => setProductsOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Products & Tech <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${productsOpen ? "rotate-180" : "group-hover:rotate-180"}`} />
              </button>
              <AnimatePresence>
                {productsOpen && (
                  <motion.div
                    id="layout-products-mega"
                    role="menu"
                    aria-label="Products and Tech mega menu"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[720px] max-w-[92vw] bg-popover border rounded-2xl shadow-xl p-6 z-50"
                  >
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Core Engines</div>
                        <div className="space-y-1">
                          <Link to="/fetch" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Static Fetch</div><div className="text-xs text-muted-foreground">curl_cffi, HTTP/3</div></Link>
                          <Link to="/fetch" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Dynamic</div><div className="text-xs text-muted-foreground">Playwright, JS</div></Link>
                          <Link to="/fetch" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Stealth</div><div className="text-xs text-muted-foreground">Patchright, Turnstile</div></Link>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> Data Tools</div>
                        <div className="space-y-1">
                          <Link to="/parse" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Parse Playground</div><div className="text-xs text-muted-foreground">CSS / XPath / Regex</div></Link>
                          <Link to="/selectors" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Selectors Library</div><div className="text-xs text-muted-foreground">Saved adaptive</div></Link>
                          <Link to="/jobs" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Jobs & Runs</div><div className="text-xs text-muted-foreground">Crawl, export</div></Link>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Infra</div>
                        <div className="space-y-1">
                          <Link to="/sessions" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Sessions</div><div className="text-xs text-muted-foreground">Warm pools</div></Link>
                          <Link to="/proxies" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">Proxies & Groups</div><div className="text-xs text-muted-foreground">Rotate IPs</div></Link>
                          <Link to="/system" role="menuitem" className="block rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="text-sm font-medium">System</div><div className="text-xs text-muted-foreground">Disk, browser, MCP</div></Link>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Garmin-style 3-column mega — hover meaningful, not decorative.</span>
                      <Link to="/ai" role="menuitem" className="text-xs font-medium hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"><Bot className="h-3 w-3" /> AI / MCP →</Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Resources mega — Blog/Success etc like garmin Support */}
            <div
              className="relative group"
              onMouseEnter={() => setResourcesOpen(true)}
              onMouseLeave={() => setResourcesOpen(false)}
              onFocus={() => setResourcesOpen(true)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setResourcesOpen(false); }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={resourcesOpen}
                aria-controls="layout-resources-mega"
                onClick={() => setResourcesOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Resources <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${resourcesOpen ? "rotate-180" : "group-hover:rotate-180"}`} />
              </button>
              <AnimatePresence>
                {resourcesOpen && (
                  <motion.div
                    id="layout-resources-mega"
                    role="menu"
                    aria-label="Resources mega menu"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute left-0 top-full mt-2 w-[520px] max-w-[92vw] bg-popover border rounded-2xl shadow-xl p-5 z-50"
                  >
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Learn</div>
                        <Link to="/help" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">Docs & Help</div><div className="text-xs text-muted-foreground">Plain-English guides</div></div></Link>
                        <Link to="/solutions" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Award className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">Success Stories</div><div className="text-xs text-muted-foreground">24/7 visibility, 95% less theft</div></div></Link>
                        <Link to="/ai" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Bot className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">Blog — RAG / Markdown</div><div className="text-xs text-muted-foreground">SiteToMarkdown for LLMs</div></div></Link>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Community</div>
                        <Link to="/system" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">Community</div><div className="text-xs text-muted-foreground">GitHub, Discord</div></div></Link>
                        <Link to="/audit" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ClipboardList className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">Audit Log</div><div className="text-xs text-muted-foreground">Who did what</div></div></Link>
                        <Link to="/api-keys" role="menuitem" className="flex gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Key className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><div className="text-sm font-medium">API Keys</div><div className="text-xs text-muted-foreground">Service tokens</div></div></Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/help">Help</Link></Button>
            <Button asChild size="sm" className="rounded-full" title="No login needed — demo is rate-limited"><Link to="/magic-demo">Try Live Fetch</Link></Button>
          </div>
        </div>

        <header className="h-14 border-b flex items-center px-4 gap-2 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="shrink-0">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[280px] p-0 left-0 right-auto border-r border-l-0" aria-label="Site navigation">
              <SheetHeader className="p-4 border-b text-left">
                <SheetTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5" aria-hidden /> Chaan-Been
                </SheetTitle>
              </SheetHeader>
              <nav className="p-2 space-y-1 overflow-auto max-h-[calc(100vh-140px)]" aria-label="Mobile">
                {nav.map((n) => {
                  const Icon = n.icon;
                  const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
                  if (n.admin && !isAdmin) return null;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      aria-label={`Go to ${n.label}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors",
                        active && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden /> {n.label}
                      {n.admin && <Badge variant="secondary" className="ml-auto text-[10px]">admin</Badge>}
                    </Link>
                  );
                })}
              </nav>
              <div className="p-3 border-t space-y-2">
                <div className="text-xs text-muted-foreground truncate">{user?.email} · {user?.role}</div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { logout(); navgt("/login"); }}>
                  <LogOut className="h-4 w-4 mr-2" aria-hidden /> Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/" className="font-semibold truncate" aria-label="Chaan-Been home">Chaan-Been</Link>
          <div className="ml-auto">
            <Button asChild size="sm" className="rounded-full">
              <Link to="/fetch" aria-label="Try Fetch">Try Fetch</Link>
            </Button>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main
            key={loc.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
        {/* Bottom FAB — mobile only */}
        <Link
          to="/fetch"
          aria-label="Try Fetch — quick start"
          className="md:hidden fixed bottom-5 right-5 z-40 h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center gap-2 font-semibold text-sm hover:scale-105 active:scale-95 transition-transform"
        >
          <Zap className="h-4 w-4" aria-hidden /> Try Fetch
        </Link>
      </div>
    </div>
  );
}
