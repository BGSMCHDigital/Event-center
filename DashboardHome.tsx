import { Link, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/hooks/useUserRole";

export default function DashboardHome() {
  const { isAdmin } = useOutletContext<{ user: User; role: AppRole; isAdmin: boolean; isEditor: boolean }>();

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">Welcome back. Manage event submissions below.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-subtle">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Submissions</h3>
          <p className="mt-1 text-sm text-muted-foreground">Review, approve, or reject submitted event reports.</p>
          <Button className="mt-4" asChild>
            <Link to="/dashboard/submissions">View Submissions</Link>
          </Button>
        </div>

        {isAdmin && (
          <div className="rounded-lg border bg-card p-6 shadow-subtle">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">User Control</h3>
            <p className="mt-1 text-sm text-muted-foreground">Invite users and manage roles (admin/editor).</p>
            <Button className="mt-4" asChild>
              <Link to="/dashboard/users">Manage Users</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
