import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import type { ProxyGroupOut, ProxyOut } from "@/lib/types";
import { useConfirm } from "@/hooks/useConfirm";
import { Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ProxiesPage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const { user: authUser } = useAuthStore();
  const isAdmin = authUser?.role === "admin";
  const [label, setLabel] = React.useState("");
  const [server, setServer] = React.useState("http://proxy.example:8080");
  const [user, setUser] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [groupName, setGroupName] = React.useState("");
  const [strategy, setStrategy] = React.useState("cyclic_rotation");
  const [pickedMemberIds, setPickedMemberIds] = React.useState<number[]>([]);

  const proxiesQ = useQuery<ProxyOut[]>({
    queryKey: ["proxies"],
    queryFn: () => apiFetch("/proxies"),
  });
  const groupsQ = useQuery<ProxyGroupOut[]>({
    queryKey: ["proxy-groups"],
    queryFn: () => apiFetch("/proxy-groups"),
  });

  const addProxy = useMutation({
    mutationFn: () => apiFetch("/proxies", {
      method: "POST",
      body: JSON.stringify({
        label,
        url_or_server: server,
        username: user || undefined,
        password: pass || undefined,
      }),
    }),
    onSuccess: () => {
      toast.success(`Proxy "${label}" added`);
      setLabel(""); setUser(""); setPass("");
      qc.invalidateQueries({ queryKey: ["proxies"] });
    },
    onError: (e: unknown) => toast.error(`Add failed: ${String((e as Error).message)}`),
  });

  const delProxyMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/proxies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Proxy deleted");
      qc.invalidateQueries({ queryKey: ["proxies"] });
      qc.invalidateQueries({ queryKey: ["proxy-groups"] });
    },
    onError: (e: unknown) => toast.error(`Delete failed: ${String((e as Error).message)}`),
  });

  const addGroup = useMutation({
    mutationFn: () => apiFetch("/proxy-groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName, strategy, member_ids: pickedMemberIds }),
    }),
    onSuccess: () => {
      toast.success(`Group "${groupName}" created`);
      setGroupName(""); setPickedMemberIds([]);
      qc.invalidateQueries({ queryKey: ["proxy-groups"] });
    },
    onError: (e: unknown) => toast.error(`Create failed: ${String((e as Error).message)}`),
  });

  const delGroupMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/proxy-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["proxy-groups"] });
    },
    onError: (e: unknown) => toast.error(`Delete failed: ${String((e as Error).message)}`),
  });

  function toggleMember(id: number) {
    setPickedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proxies & Groups</h1>
        <motion.div whileHover={{ scale: 1.05 }}><Badge variant={isAdmin ? "default" : "destructive"}>{isAdmin ? "admin" : "member"} view</Badge></motion.div>
      </motion.div>
      <PageHelp title={helpTexts.proxies.title} description={helpTexts.proxies.description} tips={helpTexts.proxies.tips} />
      <AnimatePresence>
        {!isAdmin && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-sm text-destructive font-medium">403 — Admin access required. Backend will reject with 403.</div>
                <p className="text-xs text-muted-foreground mt-1">Logged in as {authUser?.email} ({authUser?.role}).</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="grid md:grid-cols-2 gap-4">
        <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 400 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Add proxy</CardTitle>
              <CardDescription>Single proxy — credentials encrypted at rest, admin only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Label (unique)</Label><InfoTooltip content={helpTexts.proxies.fields.label} /></div>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="us-east-1" />
              <FieldHelp>{helpTexts.proxies.fields.label}</FieldHelp>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>URL or server</Label><InfoTooltip content={helpTexts.proxies.fields.server} /></div>
              <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://proxy.example:8080 or socks5://..." />
              <FieldHelp>{helpTexts.proxies.fields.server}</FieldHelp>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1"><Label>Username</Label><InfoTooltip content={helpTexts.proxies.fields.username} /></div>
                <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1"><Label>Password</Label><InfoTooltip content={helpTexts.proxies.fields.password} /></div>
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="stored encrypted, never shown again" />
              </div>
            </div>
            <Button onClick={() => addProxy.mutate()} disabled={addProxy.isPending || !label || !isAdmin}>
              {addProxy.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : "Add proxy"}
            </Button>
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Label</TableHead><TableHead>Server</TableHead><TableHead>Auth</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                <AnimatePresence>
                  {proxiesQ.data?.map((p, idx) => (
                    <motion.tr key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: idx * 0.03 }} className="border-b transition-colors hover:bg-muted/50">
                      <TableCell>{p.id}</TableCell>
                      <TableCell>{p.label}</TableCell>
                      <TableCell className="truncate max-w-[180px]">{p.url_or_server}</TableCell>
                      <TableCell>{p.has_auth ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isAdmin}
                          onClick={async () => {
                            if (await confirm(`Delete proxy "${p.label}"?`, "This will also remove it from any groups.", { destructive: true })) {
                              delProxyMut.mutate(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {proxiesQ.data?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No proxies yet — add one above.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </motion.div>

        <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 400 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Proxy groups</CardTitle>
              <CardDescription>Bundle proxies into a rotating group — Jobs reference it via proxy_group_id.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Group name</Label><InfoTooltip content={helpTexts.proxies.fields.groupName} /></div>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="us-pool" />
              <FieldHelp>{helpTexts.proxies.fields.groupName}</FieldHelp>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Strategy</Label><InfoTooltip content={helpTexts.proxies.fields.strategy} /></div>
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                <option value="cyclic_rotation">cyclic_rotation — go 1→2→3→1</option>
                <option value="random">random — pick any each time</option>
              </Select>
              <FieldHelp>{helpTexts.proxies.fields.strategy}</FieldHelp>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1"><Label>Members</Label><InfoTooltip content="Pick the proxies that should rotate together." /></div>
              {proxiesQ.data && proxiesQ.data.length > 0 ? (
                <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                  {proxiesQ.data.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pickedMemberIds.includes(p.id)}
                        onChange={() => toggleMember(p.id)}
                      />
                      <span className="font-medium">#{p.id}</span>
                      <span className="text-muted-foreground">— {p.label} ({p.url_or_server})</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Add at least one proxy on the left before creating a group.</div>
              )}
            </div>
            <Button onClick={() => addGroup.mutate()} disabled={addGroup.isPending || !groupName || pickedMemberIds.length === 0 || !isAdmin}>
              {addGroup.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create group"}
            </Button>
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Strategy</TableHead><TableHead>Members</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                <AnimatePresence>
                  {groupsQ.data?.map((g, idx) => (
                    <motion.tr key={g.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.03 }} className="border-b transition-colors hover:bg-muted/50">
                      <TableCell>{g.id}</TableCell>
                      <TableCell>{g.name}</TableCell>
                      <TableCell>{g.strategy}</TableCell>
                      <TableCell>{g.member_ids.join(", ")}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isAdmin}
                          onClick={async () => {
                            if (await confirm(`Delete group "${g.name}"?`, undefined, { destructive: true })) {
                              delGroupMut.mutate(g.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {groupsQ.data?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No groups yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
      {ConfirmDialog}
    </motion.div>
  );
}
