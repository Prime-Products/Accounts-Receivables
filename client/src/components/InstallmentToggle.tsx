import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSignature } from "lucide-react";

/**
 * Two-option invoice scope toggle shared by every invoice list:
 * All invoices / Contract installments only.
 */
export default function InstallmentToggle({
  value,
  onChange,
}: {
  value: "all" | "installments";
  onChange: (v: "all" | "installments") => void;
}) {
  return (
    <Tabs value={value} onValueChange={v => onChange(v as "all" | "installments")}>
      <TabsList>
        <TabsTrigger value="all">All invoices</TabsTrigger>
        <TabsTrigger value="installments" className="gap-1">
          <FileSignature className="h-3.5 w-3.5 text-violet-600" /> Installments only
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
