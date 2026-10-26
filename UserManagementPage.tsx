import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

type RoleRow = {
  id: string;
  user_id: string;
  role: "admin" | "editor" | "user";
};

export default function UserManagementPage() {
  const { user } = useOutletContext<{ user: User }>();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor">("editor");
  const [submitting, setSubmitting] = useState(false);

  const fetchRoles = async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("role");
    if (error) {
      toast.error("Failed to load users");
    } else {
      setRoles((data as RoleRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !invitePassword) {
      toast.error("Email and password are required");
      return;
    }
    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: inviteEmail,
        password: invitePassword,
        role: inviteRole,
        full_name: inviteName,
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    setSubmitting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to invite user");
    } else {
      toast.success(`User ${inviteEmail} invited as ${inviteRole}`);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      fetchRoles();
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!confirm("Remove this user's role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) {
      toast.error("Failed to remove role");
    } else {
      toast.success("Role removed");
      fetchRoles();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
      <p className="mt-1 text-muted-foreground">Invite users and manage roles.</p>

      {/* Invite Form */}
      <form onSubmit={handleInvite} className="mt-6 rounded-lg border p-4 space-y-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <UserPlus className="h-5 w-5" /> Invite New User
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full Name</Label>
            <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-password">Password</Label>
            <Input id="invite-password" type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "editor")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Inviting…" : "Invite User"}
        </Button>
      </form>

      {/* Existing Roles */}
      <div className="mt-8 rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">User ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No roles assigned yet.</td></tr>
              ) : (
                roles.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{r.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-sm capitalize">{r.role}</td>
                    <td className="px-4 py-3 text-right">
                      {r.user_id !== user.id && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remove role" onClick={() => handleRemoveRole(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
