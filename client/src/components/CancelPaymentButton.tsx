import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * "Cancel payment" action for a paid / partially paid invoice.
 * Reverts ALL wire-transfer allocations that settled the invoice:
 * the invoice returns to Open, the amounts become available again on
 * their wire transfers, and derived internal transfers are removed.
 */
export function CancelPaymentButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: number;
  invoiceNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const cancelPayment = trpc.invoices.cancelPayment.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Payment cancelled on ${invoiceNumber} — ${res.allocationsRemoved} allocation(s) reverted, invoice is now ${res.newStatus}`
      );
      utils.invoices.invalidate();
      utils.customers.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
          onClick={(e) => e.stopPropagation()}
          title="Cancel the payment of this invoice"
        >
          <Undo2 className="h-3 w-3" />
          Cancel payment
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel payment — {invoiceNumber}</AlertDialogTitle>
          <AlertDialogDescription>
            This will revert all wire-transfer allocations that settled this invoice. The
            invoice will return to its unpaid state, the amounts will become available
            again on the original wire transfer(s), and any internal inter-office
            transfers created for it will be deleted. This action is recorded in the
            audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep payment</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            disabled={cancelPayment.isPending}
            onClick={(e) => {
              e.preventDefault();
              cancelPayment.mutate({ invoiceId });
            }}
          >
            {cancelPayment.isPending ? "Cancelling..." : "Yes, cancel payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
