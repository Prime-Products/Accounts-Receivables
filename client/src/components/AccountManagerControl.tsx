import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { UserRound, HandCoins } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline account-manager control for customer/group cards.
 * Shows the responsible team member as a badge; clicking it opens a popover
 * to assign or re-assign the manager. Works for a single company
 * (`customerId`) or a whole group (`groupName` — applies to every member).
 *
 * `role` selects which assignment it manages:
 * - "manager" (default): the Account Manager — handles all cases of the customer
 * - "collector": the Collector / Credit Controller — chases the receivables
 */
export function AccountManagerControl({
  manager,
  customerId,
  groupName,
  onChanged,
  role = "manager",
}: {
  /** `title` is the person's job title (e.g. "Credit Controller") when recorded. */
  manager: { id: number; name: string; title?: string | null } | null;
  customerId?: number;
  groupName?: string;
  onChanged?: () => void;
  role?: "manager" | "collector";
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const isCollector = role === "collector";
  /**
   * The chip carries the role, not just the name: "Faye Vanou · Controller" tells
   * the reader in one glance which hat that person wears on this account. It falls
   * back to the generic role label when no job title is recorded.
   */
  const roleLabel = (manager?.title ?? "").trim() || (isCollector ? "Collector" : "Account Manager");

  const setManager = trpc.customers.setAccountManager.useMutation({
    onSuccess: res => {
      toast.success(res.managerName ? `Responsible: ${res.managerName}` : "Account manager cleared");
      utils.customers.invalidate();
      utils.team.workload.invalidate();
      onChanged?.();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const setCollector = trpc.customers.setCollector.useMutation({
    onSuccess: res => {
      toast.success(res.collectorName ? `Collector: ${res.collectorName}` : "Collector cleared");
      utils.customers.invalidate();
      utils.team.workload.invalidate();
      onChanged?.();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1"
          title={isCollector ? "Assign collector (chases the receivables)" : "Assign account manager (handles all customer cases)"}
        >
          <Badge
            variant="outline"
            className={
              manager
                ? isCollector
                  ? "gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  : "gap-1 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 cursor-pointer"
                : "gap-1 bg-muted text-muted-foreground border-dashed hover:bg-muted/70 cursor-pointer"
            }
          >
            {isCollector ? <HandCoins className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
            {manager ? (
              <>
                {manager.name}
                <span className="opacity-70 font-normal">· {roleLabel}</span>
              </>
            ) : isCollector ? (
              "No collector"
            ) : (
              "No manager"
            )}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {isCollector
              ? groupName ? "Group collector" : "Collector"
              : groupName ? "Group account manager" : "Account manager"}
          </div>
          <p className="text-xs text-muted-foreground">
            {isCollector
              ? "Responsible for collecting this customer's receivables."
              : "Handles all cases of this customer."}
            {groupName ? " Applies to every company in this group." : ""}
          </p>
          <TeamMemberSelect
            value={manager?.id ?? null}
            onChange={id =>
              isCollector
                ? setCollector.mutate(
                    groupName
                      ? { collectorId: id, groupName }
                      : { collectorId: id, customerId: customerId! },
                  )
                : setManager.mutate(
                    groupName
                      ? { managerId: id, groupName }
                      : { managerId: id, customerId: customerId! },
                  )
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
