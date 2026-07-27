import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";

interface BankDetailsProps {
  customerId: number;
}

export function BankDetails({ customerId }: BankDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    iban: "",
    accountNumber: "",
    bankName: "",
    swiftCode: "",
    beneficiaryName: "",
    currency: "EUR",
  });

  // Fetch bank details
  const { data: bankDetails, isLoading } = trpc.customers.getBankDetails.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

  // Save bank details mutation
  const saveMutation = trpc.customers.saveBankDetails.useMutation({
    onSuccess: () => {
      toast.success("Bank details saved successfully");
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete bank details mutation
  const deleteMutation = trpc.customers.deleteBankDetails.useMutation({
    onSuccess: () => {
      toast.success("Bank details deleted successfully");
      setFormData({
        iban: "",
        accountNumber: "",
        bankName: "",
        swiftCode: "",
        beneficiaryName: "",
        currency: "EUR",
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Update form when bank details are fetched
  useEffect(() => {
    if (bankDetails) {
      setFormData({
        iban: bankDetails.iban || "",
        accountNumber: bankDetails.accountNumber || "",
        bankName: bankDetails.bankName || "",
        swiftCode: bankDetails.swiftCode || "",
        beneficiaryName: bankDetails.beneficiaryName || "",
        currency: bankDetails.currency || "EUR",
      });
    }
  }, [bankDetails]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync({
        customerId,
        ...formData,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete these bank details?")) {
      await deleteMutation.mutateAsync({ customerId });
    }
  };

  const hasData = bankDetails && Object.values(bankDetails).some((v) => v && v !== "EUR");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isEditing && hasData ? (
        // Display mode
        <Card className="p-6">
          <div className="space-y-3">
            {formData.beneficiaryName && (
              <div>
                <Label className="text-xs text-muted-foreground">Beneficiary Name</Label>
                <p className="font-medium">{formData.beneficiaryName}</p>
              </div>
            )}
            {formData.iban && (
              <div>
                <Label className="text-xs text-muted-foreground">IBAN</Label>
                <p className="font-mono text-sm">{formData.iban}</p>
              </div>
            )}
            {formData.accountNumber && (
              <div>
                <Label className="text-xs text-muted-foreground">Account Number</Label>
                <p className="font-mono text-sm">{formData.accountNumber}</p>
              </div>
            )}
            {formData.bankName && (
              <div>
                <Label className="text-xs text-muted-foreground">Bank Name</Label>
                <p>{formData.bankName}</p>
              </div>
            )}
            {formData.swiftCode && (
              <div>
                <Label className="text-xs text-muted-foreground">Swift Code</Label>
                <p className="font-mono text-sm">{formData.swiftCode}</p>
              </div>
            )}
            {formData.currency && (
              <div>
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <p>{formData.currency}</p>
              </div>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          </div>
        </Card>
      ) : isEditing || !hasData ? (
        // Edit mode
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="beneficiaryName">Beneficiary Name</Label>
              <Input
                id="beneficiaryName"
                name="beneficiaryName"
                value={formData.beneficiaryName}
                onChange={handleInputChange}
                placeholder="e.g., ACME Inc"
              />
            </div>

            <div>
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                name="iban"
                value={formData.iban}
                onChange={handleInputChange}
                placeholder="e.g., GR1234567890..."
              />
            </div>

            <div>
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                value={formData.accountNumber}
                onChange={handleInputChange}
                placeholder="e.g., 12345678"
              />
            </div>

            <div>
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                name="bankName"
                value={formData.bankName}
                onChange={handleInputChange}
                placeholder="e.g., Eurobank"
              />
            </div>

            <div>
              <Label htmlFor="swiftCode">Swift Code</Label>
              <Input
                id="swiftCode"
                name="swiftCode"
                value={formData.swiftCode}
                onChange={handleInputChange}
                placeholder="e.g., ERBKGRAA"
              />
            </div>

            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                placeholder="e.g., EUR"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={isSaving || saveMutation.isPending}>
                {isSaving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Save
              </Button>
              {hasData && (
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {!hasData && !isEditing && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">No bank details added yet</p>
          <Button onClick={() => setIsEditing(true)}>Add Bank Details</Button>
        </Card>
      )}
    </div>
  );
}
