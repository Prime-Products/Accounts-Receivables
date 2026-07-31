import { describe, expect, it } from "vitest";
import {
  softOneContractInstallmentPreviewQuery,
  softOneContractInstallmentSummaryQuery,
} from "./lib/softoneContractInstallments";

describe("SoftOne contract installment diagnostic", () => {
  it("uses the confirmed SoftOne installment-to-invoice relationship", () => {
    for (const query of [
      softOneContractInstallmentSummaryQuery,
      softOneContractInstallmentPreviewQuery,
    ]) {
      expect(query).toContain("[dbo].[CCCINSTALMENTS]");
      expect(query).toContain("contract.[ACTIVE247] = 1");
      expect(query).toContain("installment.[FINDOC] IS NOT NULL");
      expect(query).toContain("[dbo].[FINPAYTERMS]");
      expect(query).toContain("payment.[ISCLOSE] = 0");
      expect(query).toContain("payment.[ISCANCEL] = 0");
      expect(query).toContain("payment.[APPRV] = 1");
    }
  });

  it("derives overdue installments from open amount and due date", () => {
    expect(softOneContractInstallmentSummaryQuery).toContain(
      "terms.[OUTSTANDING] > 0.005",
    );
    expect(softOneContractInstallmentSummaryQuery).toContain(
      "terms.[DUE_DATE] < CAST(GETDATE() AS date)",
    );
  });

  it("previews the linked invoice, customer and vessel", () => {
    expect(softOneContractInstallmentPreviewQuery).toContain("invoice.[FINCODE]");
    expect(softOneContractInstallmentPreviewQuery).toContain("customer.[NAME]");
    expect(softOneContractInstallmentPreviewQuery).toContain("vessel.[NAME]");
  });
});
