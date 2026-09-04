import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHelp, FieldHelp } from "@/components/ui/help";
import { InfoTooltip } from "@/components/ui/tooltip";
import { helpTexts } from "@/lib/helpTexts";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

type UserRow = {
  id: number;
  email: string;
  role: string;
  is_active: number | boolean;
  created_by: string | null;
  created_at: string;
};

export default function UsersPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [pwMap, setPwMap] = React.useState<Record<number, string>>({});

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRow[]>("/users"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<{ id: number; email: string; role: string }>("/users", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEmail("");
      setPassword("");
      setRole("member");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch<{ ok: boolean }>(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const handleToggleActive = (u: UserRow) => {
    const active = u.is_active === 1 || u.is_active === true;
    updateMut.mutate({ id: u.id, body: { is_active: !active } });
  };

  const handleChangeRole = (u: UserRow) => {
    const next = u.role === "admin" ? "member" : "admin";
    updateMut.mutate({ id: u.id, body: { role: next } });
  };

  const handleResetPw = (u: UserRow) => {
    const pw = pwMap[u.id];
    if (!pw) return;
    updateMut.mutate({ id: u.id, body: { password: pw } });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <motion.div whileHover={{ scale: 1.05 }}><Badge variant={isAdmin ? "default" : "destructive"} className="transition-transform">{isAdmin ? "admin" : "member"} view</Badge></motion.div>
      </motion.div>
      <PageHelp title={helpTexts.users.title} description={helpTexts.users.description} tips={helpTexts.users.tips} />

      <AnimatePresence>
        {!isAdmin && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-sm text-destructive font-medium">403 — Admin access required. Backend will reject requests with 403.</div>
                <p className="text-xs text-muted-foreground mt-1">You are logged in as {user?.email} ({user?.role}). Switch to an admin account to manage users.</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <CardTitle>Create user — POST /api/users (admin)</CardTitle>
            <CardDescription>Fields: email, password, role (admin/member). 409 if email exists, 422 if role invalid.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="newuser@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 12 chars" />
                <FieldHelp>Min 12 chars (backend 422 otherwise).</FieldHelp>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !email || password.length < 12}>
                {createMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create user"}
              </Button>
              {(createMut.isSuccess || usersQ.isSuccess) && <span className="text-xs text-muted-foreground">POST creates audit_log user.create</span>}
            </div>
            <AnimatePresence>
              {createMut.error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded">{String((createMut.error as Error).message)}</motion.div>}
              {createMut.isSuccess && <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="text-sm text-green-600 bg-green-50 p-2 rounded">User created — id {(createMut.data as unknown as { id: number })?.id}</motion.div>}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardHeader>
            <CardTitle>All users · GET /api/users · PATCH /users/{`{id}`} (admin)</CardTitle>
            <CardDescription>Table id / email / role / is_active / created_by / created_at · actions: toggle active, change role, reset password (PATCH). Updates write audit_log user.update.</CardDescription>
          </CardHeader>
          <CardContent>
            {usersQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
            <AnimatePresence>
              {usersQ.error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-2">{String((usersQ.error as Error).message)}</motion.div>}
              {updateMut.error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-2">Patch error: {String((updateMut.error as Error).message)}</motion.div>}
              {updateMut.isSuccess && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-green-600 mb-2">Update succeeded — audit user.update written.</motion.div>}
            </AnimatePresence>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Created at</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {usersQ.data?.map((u, idx) => {
                  const active = u.is_active === 1 || u.is_active === true;
                  return (
                    <motion.tr key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.04 }} className="border-b transition-colors hover:bg-muted/50">
                      <TableCell>{u.id}</TableCell>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="transition-transform hover:scale-105">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={active ? "default" : "destructive"} className={active ? "animate-pulse" : ""}>{active ? "active" : "disabled"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{u.created_by ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{u.created_at}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[220px]">
                          <div className="flex gap-1 flex-wrap">
                            <Button size="sm" variant={active ? "destructive" : "default"} onClick={() => handleToggleActive(u)} disabled={updateMut.isPending}>
                              {active ? "Disable" : "Enable"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleChangeRole(u)} disabled={updateMut.isPending}>
                              → {u.role === "admin" ? "member" : "admin"}
                            </Button>
                          </div>
                          <div className="flex gap-1 items-center">
                            <Input
                              placeholder="new password (min 12)"
                              type="password"
                              className="h-8 text-xs"
                              value={pwMap[u.id] ?? ""}
                              onChange={(e) => setPwMap((m) => ({ ...m, [u.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="secondary" onClick={() => handleResetPw(u)} disabled={updateMut.isPending || (pwMap[u.id]?.length ?? 0) < 12}>
                              Reset PW
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {usersQ.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => usersQ.refetch()}>
              {usersQ.isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Refresh
            </Button>
            {usersQ.isFetching && <span className="text-xs text-muted-foreground py-2 animate-pulse">Refreshing…</span>}
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
