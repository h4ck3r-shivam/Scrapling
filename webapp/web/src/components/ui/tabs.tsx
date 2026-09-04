import * as React from "react";
import { cn } from "@/lib/utils";
type TabsContextType = { value: string; onValueChange: (v: string) => void };
const Ctx = React.createContext<TabsContextType | null>(null);
export function Tabs({ defaultValue, value, onValueChange, children, className }: { defaultValue?: string; value?: string; onValueChange?: (v: string) => void; children: React.ReactNode; className?: string }) {
  const [inner, setInner] = React.useState(value ?? defaultValue ?? "");
  const cur = value ?? inner;
  const set = (v: string) => { if (!value) setInner(v); onValueChange?.(v); };
  return <Ctx.Provider value={{ value: cur, onValueChange: set }}><div className={cn(className)}>{children}</div></Ctx.Provider>;
}
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}>{children}</div>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)!;
  const active = ctx.value === value;
  return <button onClick={() => ctx.onValueChange(value)} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all duration-200 hover:bg-background/50", active ? "bg-background text-foreground shadow" : "")}>{children}</button>;
}
export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return <div className={cn("mt-2 ring-offset-background focus-visible:outline-none", className)}>{children}</div>;
}
