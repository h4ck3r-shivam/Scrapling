import * as React from "react";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { VirtualizedTable } from "@/components/VirtualizedTable";
import { RecordSheet } from "@/components/RecordSheet";

export type ResultRow = { idx: number; item: unknown };

function itemToRecord(item: unknown): Record<string, unknown> | null {
  if (item && typeof item === "object" && !Array.isArray(item)) return item as Record<string, unknown>;
  return null;
}

export function getDynamicColumns(rows: ResultRow[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(0, 5)) {
    const rec = itemToRecord(r.item);
    if (!rec) continue;
    for (const k of Object.keys(rec)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
    if (cols.length >= 8) break;
  }
  return cols.length ? cols.slice(0, 8) : [];
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ").slice(0, 120);
  try {
    return JSON.stringify(v).slice(0, 120);
  } catch {
    return String(v).slice(0, 120);
  }
}

const PHONE_KEYS = ["phone", "mobile", "tel", "telephone", "whatsapp", "contact", "number", "phones"];

const EMAIL_KEYS = ["email", "emails", "e-mail", "mail"];

export function findPhoneField(rec: Record<string, unknown>): { key: string; value: string } | null {
  for (const k of Object.keys(rec)) {
    const lk = k.toLowerCase();
    if (PHONE_KEYS.some((p) => lk.includes(p))) {
      const v = rec[k];
      const s = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
      if (s && /\d{5,}/.test(s.replace(/\D/g, ""))) return { key: k, value: s };
    }
  }
  // fallback: any value that looks like a phone
  for (const [k, v] of Object.entries(rec)) {
    const s = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
    if (/\d{7,}/.test(s.replace(/[\s-]/g, "")) && s.length < 30) {
      const digits = s.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) return { key: k, value: s };
    }
  }
  return null;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function findEmailField(rec: Record<string, unknown>): { key: string; value: string } | null {
  for (const k of Object.keys(rec)) {
    const lk = k.toLowerCase();
    if (EMAIL_KEYS.some((p) => lk.includes(p))) {
      const v = rec[k];
      const s = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
      if (s && s.includes("@")) return { key: k, value: s };
      // Array of emails: join first valid
      if (Array.isArray(v)) {
        const first = (v as unknown[]).map((x) => String(x)).find((x) => x.includes("@"));
        if (first) return { key: k, value: first };
      }
    }
  }
  return null;
}

export function ResultsTable({
  rows,
  emptyHint,
}: {
  rows: ResultRow[];
  emptyHint?: string;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<ResultRow | null>(null);
  const columns = React.useMemo(() => getDynamicColumns(rows), [rows]);

  async function copyText(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(t);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  const viewingRecord = React.useMemo(() => {
    if (!viewing) return null;
    return itemToRecord(viewing.item) ?? { value: viewing.item };
  }, [viewing]);

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground p-4 border rounded">{emptyHint ?? "No results yet — press Start and watch live progress."}</div>;
  }

  if (!columns.length) {
    // Non-object items (strings/numbers)
    return (
      <div className="space-y-2">
      <RecordSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Row #${viewing.idx} — full details` : "Row details"}
        record={viewingRecord}
      />
      <VirtualizedTable
        items={rows}
        height={480}
        rowHeight={56}
        header={
          <div className="grid grid-cols-[60px_1fr_auto] gap-2 px-2 py-2 text-xs font-medium border rounded-t-md bg-muted/40 sticky top-0 z-10">
            <div>#</div>
            <div className="flex items-center gap-1">Value <InfoTooltip content="One result per row" /></div>
            <div>Actions</div>
          </div>
        }
        renderRow={(row) => {
          const r = row as ResultRow;
          const txt = cellText(r.item);
          return (
            <div className="grid grid-cols-[60px_1fr_auto] gap-2 w-full items-center">
              <div className="text-xs text-muted-foreground">{r.idx}</div>
              <div className="truncate text-sm">{txt}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button>
                <Button size="sm" variant="outline" onClick={() => copyText(txt)}>Copy</Button>
              </div>
            </div>
          );
        }}
      />
      </div>
    );
  }

  const gridCols = `60px repeat(${columns.length}, minmax(120px, 1fr)) 150px`;

  return (
    <div className="space-y-2">
      <RecordSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Row #${viewing.idx} — full details` : "Row details"}
        subtitle="Every field, fully visible. Copy what you need — no download required."
        record={viewingRecord}
      />
      <VirtualizedTable
        items={rows}
        height={520}
        rowHeight={64}
        header={
          <div className="grid gap-2 px-2 py-2 text-xs font-medium border rounded-t-md bg-muted/40 sticky top-0 z-10" style={{ gridTemplateColumns: gridCols }}>
            <div>#</div>
            {columns.map((c) => (
              <div key={c} className="truncate" title={c}>{c}</div>
            ))}
            <div className="flex items-center gap-1">Call / Email <InfoTooltip content="View the full row, copy the phone or email, open a WhatsApp chat or new email in one click" /></div>
          </div>
        }
        renderRow={(row) => {
          const r = row as ResultRow;
          const rec = itemToRecord(r.item) ?? {};
          const phone = findPhoneField(rec);
          const email = findEmailField(rec);
          const waDigits = phone ? digitsOnly(phone.value) : "";
          return (
            <div className="grid gap-2 w-full items-center" style={{ gridTemplateColumns: gridCols }}>
              <div className="text-xs text-muted-foreground">{r.idx}</div>
              {columns.map((c) => (
                <div key={c} className="truncate text-sm" title={cellText(rec[c])}>{cellText(rec[c])}</div>
              ))}
              <div className="flex gap-1 flex-wrap items-center">
                <Button size="sm" variant="ghost" onClick={() => setViewing(r)} title="View the full row">
                  View
                </Button>
                {phone ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copyText(phone.value)} title={`Copy ${phone.key}: ${phone.value}`}>
                      {copied === phone.value ? "Copied!" : "Copy"}
                    </Button>
                    {waDigits && (
                      <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="secondary">WhatsApp</Button>
                      </a>
                    )}
                  </>
                ) : null}
                {email ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copyText(email.value)} title={`Copy ${email.key}: ${email.value}`}>
                      {copied === email.value ? "Copied!" : "Copy email"}
                    </Button>
                    <a href={`mailto:${email.value}`}>
                      <Button size="sm" variant="secondary">Email</Button>
                    </a>
                  </>
                ) : null}
                {!phone && !email && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        }}
      />
      <FieldHelp>Columns come from your collected fields ({columns.join(", ")}). Use Copy for calling, WhatsApp to chat instantly.</FieldHelp>
    </div>
  );
}
