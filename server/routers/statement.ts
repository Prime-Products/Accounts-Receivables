import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";


export const statementRouter = router({
  getStatementData: protectedProcedure
    .input(z.object({
      customerId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const customer = await db.query.customers.findFirst({
        where: (customers, { eq }) => eq(customers.id, input.customerId),
      });

      if (!customer) {
        throw new Error("Customer not found");
      }

      const invoices = await db.query.invoices.findMany({
        where: (invoices, { eq }) => eq(invoices.customerId, input.customerId),
      });

      // Calculate total amounts summary
      let balance = 0;
      let unpaidDocuments = 0;
      let overdueDocuments = 0;
      let upcomingWithinMonth = 0;
      let upcomingNextMonth = 0;

      const now = Date.now();
      const currentMonth = new Date(now).getMonth();
      const currentYear = new Date(now).getFullYear();

      for (const invoice of invoices) {
        const openAmount = Number(invoice.amount) - Number(invoice.paidAmount);
        balance += openAmount;

        if (invoice.status !== "Paid") {
          unpaidDocuments += openAmount;
        }

        const dueDate = new Date(invoice.dueDate).getTime();
        if (dueDate < now && invoice.status !== "Paid") {
          overdueDocuments += openAmount;
        }

        const invoiceMonth = new Date(dueDate).getMonth();
        const invoiceYear = new Date(dueDate).getFullYear();

        if (invoiceYear === currentYear && invoiceMonth === currentMonth && dueDate > now) {
          upcomingWithinMonth += openAmount;
        } else if (invoiceYear === currentYear && invoiceMonth === currentMonth + 1 && dueDate > now) {
          upcomingNextMonth += openAmount;
        }
      }

      const analysisSection = invoices.map(invoice => ({
        docDate: new Date(Number(invoice.issueDate)).toLocaleDateString("en-GB"),
        documents: invoice.invoiceNumber,
        docAmount: Number(invoice.amount),
        openDocAmount: Number(invoice.amount) - Number(invoice.paidAmount),
        overdue: invoice.dueDate < now && invoice.status !== "Paid" ? Math.floor((now - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        vessel: "", // Placeholder, needs to come from invoice data if available
        comments: invoice.notes || "",
      }));

      return {
        customer: {
          name: customer.name,
          address: customer.notes || "", // Assuming address is stored in notes field
          paymentTerms: `${customer.paymentTermsDays} days Credit` || ""
        },
        totalAmountsSummary: [
          { company: customer.name, currency: "EUR", balance, unpaidDocuments, overdueDocuments, upcomingWithinMonth, upcomingNextMonth },
        ],
        analysisSection,
        bankDetails: {
          beneficiaryName: "PRIME PRODUCTS LTD", // Placeholder
          iban: "GR12345678901234567890123", // Placeholder
          swift: "SWIFTCODE", // Placeholder
        },
      };
    }),
});
