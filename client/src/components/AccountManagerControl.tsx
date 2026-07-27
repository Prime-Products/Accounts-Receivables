import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline account-manager control for customer/group cards.
 * Shows the responsible team member as a badge; clicking it opens a popover
 * to assign or re-assign the manager. Works for a single company
 * (`customerId`) or a whole group (`groupName` — applies to every member).
 */
export function AccountManagerControl({
  manager,
  customerId,
  groupName,
  onChanged,
}: {
  manager: { id: number; name: string } | null;
  customerId?: number;
  groupName?: string;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" title="Assign responsible team member">
          <Badge
            variant="outline"
            className={
              manager
                ? "gap-1 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 cursor-pointer"
                : "gap-1 bg-muted text-muted-foreground border-dashed hover:bg-muted/70 cursor-pointer"
            }
          >
            <UserRound className="h-3 w-3" />
            {manager ? manager.name : "No manager"}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {groupName ? "Group account manager" : "Account manager"}
          </div>
          <p className="text-xs text-muted-foreground">
            {groupName
              ? "Applies to every company in this group."
              : "Responsible team member for this customer."}
          </p>
          <TeamMemberSelect
            value={manager?.id ?? null}
            onChange={id =>
              setManager.mutate(
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
