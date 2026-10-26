import { Circle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "draft" | "submitted" | "approved" | "rejected";

const statusConfig: Record<Status, { label: string; icon: React.ElementType; className: string }> = {
  draft: { label: "Draft", icon: Circle, className: "text-muted-foreground bg-muted" },
  submitted: { label: "Submitted", icon: Clock, className: "text-accent bg-accent/10" },
  approved: { label: "Approved", icon: CheckCircle2, className: "text-success bg-success/10" },
  rejected: { label: "Rejected", icon: XCircle, className: "text-destructive bg-destructive/10" },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
