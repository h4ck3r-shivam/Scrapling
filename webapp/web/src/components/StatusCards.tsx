import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useInView } from "framer-motion";
import CountUp from "react-countup";

interface StatusItem {
  label: string;
  value: string | number | React.ReactNode;
  detail?: string;
  variant?: "ok" | "warn" | "err" | "neutral";
}

interface StatusCardsProps {
  items: StatusItem[];
  className?: string;
}

const variantClasses: Record<NonNullable<StatusItem["variant"]>, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  err: "text-rose-600",
  neutral: "text-foreground",
};

function VariantIcon({ v }: { v?: StatusItem["variant"] }) {
  if (v === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
  if (v === "err") return <XCircle className="h-4 w-4 text-rose-500" aria-hidden />;
  if (v === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
  return null;
}

function AnimatedValue({ value }: { value: StatusItem["value"] }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  if (typeof value === "number") {
    return (
      <span ref={ref}>
        {inView ? <CountUp end={value} duration={1.6} separator="," /> : "0"}
      </span>
    );
  }
  return <>{value}</>;
}

/** A row of small status cards used by System + Home pages. */
export function StatusCards({ items, className }: StatusCardsProps) {
  return (
    <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }} className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3", className)}>
      {items.map((it) => (
        <motion.div key={it.label} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 15 } }}>
          <Card className="h-full card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
                  <VariantIcon v={it.variant} />
                </motion.span>
                {it.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-semibold", variantClasses[it.variant ?? "neutral"])}>
                <AnimatedValue value={it.value} />
              </div>
              {it.detail ? <div className="text-xs text-muted-foreground mt-1">{it.detail}</div> : null}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
