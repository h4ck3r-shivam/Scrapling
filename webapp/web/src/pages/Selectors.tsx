import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/help";
import { helpTexts } from "@/lib/helpTexts";
import type { SelectorOut } from "@/lib/types";
import { useConfirm } from "@/hooks/useConfirm";
import { RecordSheet } from "@/components/RecordSheet";
import { motion, AnimatePresence } from "framer-motion";

export default function SelectorsPage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const [viewing, setViewing] = React.useState<SelectorOut | null>(null);
  const q = useQuery<SelectorOut[]>({
    queryKey: ["selectors"],
    queryFn: () => apiFetch("/selectors"),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/selectors/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Selector deleted");
      qc.invalidateQueries({ queryKey: ["selectors"] });
    },
    onError: (e: unknown) => toast.error(`Delete failed: ${String((e as Error).message)}`),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold">Selectors library</motion.h1>
      <PageHelp title={helpTexts.selectors.title} description={helpTexts.selectors.description} tips={helpTexts.selectors.tips} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
        <CardHeader>
          <CardTitle>Saved selectors</CardTitle>
          <CardDescription>
            Reusable “how to grab X from page Y” recipes. Build them in the Parse playground, save them here, and plug them into Jobs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Spec</TableHead>
                <TableHead>Auto-save</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {q.data?.map((row, idx) => (
                  <motion.tr key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ delay: idx * 0.03 }} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell>{row.id}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{row.target_url}</TableCell>
                    <TableCell>{row.identifier ?? ""}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <button
                        className="truncate max-w-[260px] block text-left hover:text-foreground hover:underline"
                        title="Click to view the full spec"
                        onClick={() => setViewing(row)}
                      >
                        {JSON.stringify(row.selector_spec).slice(0, 200)}
                      </button>
                    </TableCell>
                    <TableCell>{row.auto_save ? "Yes" : "No"}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(row)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (await confirm(`Delete selector "${row.name}"?`, "This cannot be undone.", { destructive: true })) {
                            delMut.mutate(row.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
          {q.data?.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground mt-2">
              No saved selectors yet — create one via the Parse playground.
            </motion.div>
          )}
          <RecordSheet
            open={!!viewing}
            onClose={() => setViewing(null)}
            title={viewing ? `Selector — ${viewing.name}` : "Selector spec"}
            subtitle={viewing ? `${viewing.target_url}${viewing.identifier ? ` · ${viewing.identifier}` : ""}` : undefined}
            record={
              viewing
                ? {
                    name: viewing.name,
                    target_url: viewing.target_url,
                    identifier: viewing.identifier ?? "—",
                    auto_save: viewing.auto_save ? "Yes" : "No",
                    spec: viewing.selector_spec,
                  }
                : null
            }
          />
        </CardContent>
      </Card>
      </motion.div>
      {ConfirmDialog}
    </motion.div>
  );
}
