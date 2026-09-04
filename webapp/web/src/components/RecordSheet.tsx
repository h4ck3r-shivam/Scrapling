import * as React from "react";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/help";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function fullText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => typeof x === "string" || typeof x === "number")) return v.map((x) => String(x)).join(", ");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function isMultiline(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 3 || fullText(v).length > 120;
  if (v && typeof v === "object") return true;
  return String(v ?? "").length > 120;
}

/** Slide-over that shows a full record with no truncation — view everything in the UI, no download needed. */
export function RecordSheet({
  open,
  onClose,
  title,
  subtitle,
  record,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  record: Record<string, unknown> | null;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copyText(t: string, key: string) {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  const entries = React.useMemo(() => (record ? Object.entries(record) : []), [record]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </SheetHeader>
        {!record || entries.length === 0 ? (
          <div className="text-sm text-muted-foreground mt-4">Nothing to show.</div>
        ) : (
          <div className="space-y-3 mt-4">
            {entries.map(([k, v]) => {
              const text = fullText(v);
              const multi = isMultiline(v);
              return (
                <div key={k} className="border rounded-md p-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</span>
                    <Button size="sm" variant="outline" onClick={() => copyText(text === "—" ? "" : text, k)}>
                      {copied === k ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  {multi ? (
                    <pre className="mt-2 text-sm whitespace-pre-wrap break-words max-h-[300px] overflow-auto bg-background rounded p-2 border">{text}</pre>
                  ) : (
                    <div className="mt-1 text-sm break-words">{text}</div>
                  )}
                </div>
              );
            })}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => copyText(JSON.stringify(record, null, 2), "__all__")}
            >
              {copied === "__all__" ? "Copied!" : "Copy whole record (JSON)"}
            </Button>
            <FieldHelp>Everything is visible here — no need to download a file just to read a few rows.</FieldHelp>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
